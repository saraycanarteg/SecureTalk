import { promisify } from 'node:util';
import { crc32, inflate } from 'node:zlib';

import {
  assertPixelLimit,
  ColorChannel,
  corrupt,
  DecodedImage,
} from './decoded-image';

const inflateAsync = promisify(inflate);

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CHUNK_OVERHEAD = 12;
const IHDR_LENGTH = 13;

const COLOR_GRAY = 0;
const COLOR_RGB = 2;
const COLOR_PALETTE = 3;
const COLOR_GRAY_ALPHA = 4;
const COLOR_RGBA = 6;

const SAMPLES_PER_PIXEL: Record<number, number> = {
  [COLOR_GRAY]: 1,
  [COLOR_RGB]: 3,
  [COLOR_PALETTE]: 1,
  [COLOR_GRAY_ALPHA]: 2,
  [COLOR_RGBA]: 4,
};

const VALID_BIT_DEPTHS: Record<number, number[]> = {
  [COLOR_GRAY]: [1, 2, 4, 8, 16],
  [COLOR_RGB]: [8, 16],
  [COLOR_PALETTE]: [1, 2, 4, 8],
  [COLOR_GRAY_ALPHA]: [8, 16],
  [COLOR_RGBA]: [8, 16],
};

const GRAY_CHANNELS: ColorChannel[] = [{ name: 'gray', offset: 0 }];
const RGB_CHANNELS: ColorChannel[] = [
  { name: 'r', offset: 0 },
  { name: 'g', offset: 1 },
  { name: 'b', offset: 2 },
];

// El canal alfa queda fuera: suele ser constante y no forma parte del color.
const CHANNELS_BY_COLOR_TYPE: Record<number, ColorChannel[]> = {
  [COLOR_GRAY]: GRAY_CHANNELS,
  [COLOR_GRAY_ALPHA]: GRAY_CHANNELS,
  [COLOR_RGB]: RGB_CHANNELS,
  [COLOR_RGBA]: RGB_CHANNELS,
};

// Inicio y paso, en columnas y filas, de las siete pasadas de Adam7.
const ADAM7_PASSES = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
}

export async function decodePng(file: Buffer): Promise<DecodedImage> {
  const { header, idat } = readChunks(file);
  const { width, height } = header;
  const info = { format: 'png' as const, width, height };

  const expected = inflatedSize(header);
  const raw = await inflateExact(idat, expected);

  const reason = unsupportedReason(header);
  if (reason) {
    return { ...info, analyzable: false, reason };
  }

  const bytesPerPixel = SAMPLES_PER_PIXEL[header.colorType];
  return {
    ...info,
    analyzable: true,
    samples: unfilter(raw, height, width * bytesPerPixel, bytesPerPixel),
    bytesPerPixel,
    channels: CHANNELS_BY_COLOR_TYPE[header.colorType],
    bottomUp: false,
  };
}

function readChunks(file: Buffer): { header: PngHeader; idat: Buffer[] } {
  let header: PngHeader | undefined;
  const idat: Buffer[] = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + CHUNK_OVERHEAD <= file.length) {
    const dataStart = offset + 8;
    const dataEnd = dataStart + file.readUInt32BE(offset);
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > file.length) {
      corrupt('PNG truncado');
    }
    if (
      crc32(file.subarray(offset + 4, dataEnd)) !== file.readUInt32BE(dataEnd)
    ) {
      corrupt('CRC de PNG incorrecto');
    }

    const type = file.toString('latin1', offset + 4, dataStart);
    const data = file.subarray(dataStart, dataEnd);

    if (!header) {
      header = type === 'IHDR' ? parseHeader(data) : corrupt('PNG sin IHDR');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      // Rechaza los datos anexados: asi se esconden otros archivos dentro de una imagen.
      if (chunkEnd !== file.length) {
        corrupt('PNG con datos despues de IEND');
      }
      if (idat.length === 0) {
        corrupt('PNG sin IDAT');
      }
      return { header, idat };
    }
    offset = chunkEnd;
  }
  return corrupt('PNG sin IEND');
}

function parseHeader(data: Buffer): PngHeader {
  if (data.length !== IHDR_LENGTH) {
    corrupt('IHDR con longitud incorrecta');
  }

  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const [compression, filter, interlace] = [data[10], data[11], data[12]];

  if (
    width === 0 ||
    height === 0 ||
    !VALID_BIT_DEPTHS[colorType]?.includes(bitDepth) ||
    compression !== 0 ||
    filter !== 0 ||
    interlace > 1
  ) {
    corrupt('IHDR con valores invalidos');
  }

  assertPixelLimit(width, height);
  return { width, height, bitDepth, colorType, interlaced: interlace === 1 };
}

function inflatedSize(header: PngHeader): number {
  const { width, height, bitDepth, colorType, interlaced } = header;
  const bitsPerPixel = SAMPLES_PER_PIXEL[colorType] * bitDepth;
  const scanlines = (columns: number, rows: number) =>
    rows * (1 + Math.ceil((columns * bitsPerPixel) / 8));

  if (!interlaced) {
    return scanlines(width, height);
  }
  return ADAM7_PASSES.reduce((total, [startX, startY, stepX, stepY]) => {
    const columns = Math.ceil((width - startX) / stepX);
    const rows = Math.ceil((height - startY) / stepY);
    return columns > 0 && rows > 0 ? total + scanlines(columns, rows) : total;
  }, 0);
}

// El tamano exacto se conoce por la cabecera: producir mas datos es un error,
// por lo que la descompresion nunca reserva mas memoria que la que permite el limite de pixeles.
async function inflateExact(idat: Buffer[], expected: number): Promise<Buffer> {
  let raw: Buffer;
  try {
    raw = await inflateAsync(Buffer.concat(idat), {
      maxOutputLength: expected,
    });
  } catch {
    return corrupt('Datos de imagen PNG danados');
  }
  if (raw.length !== expected) {
    corrupt('Datos de imagen PNG incompletos');
  }
  return raw;
}

function unsupportedReason(header: PngHeader): string | null {
  if (header.colorType === COLOR_PALETTE) {
    return 'PNG con paleta: el bit menos significativo es un indice, no un valor de color';
  }
  if (header.bitDepth !== 8) {
    return `PNG de ${header.bitDepth} bits por canal: la tecnica solo admite 8 bits`;
  }
  if (header.interlaced) {
    return 'PNG entrelazado: la tecnica solo admite imagenes sin entrelazar';
  }
  return null;
}

function unfilter(
  raw: Buffer,
  height: number,
  stride: number,
  bytesPerPixel: number,
): Buffer {
  const out = Buffer.allocUnsafe(height * stride);
  let input = 0;
  let output = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    if (filter > 4) {
      corrupt('Filtro de PNG desconocido');
    }
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? out[output - bytesPerPixel] : 0;
      const up = y > 0 ? out[output - stride] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel ? out[output - stride - bytesPerPixel] : 0;
      out[output++] = (raw[input++] + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  return out;
}

function predict(
  filter: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  switch (filter) {
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      return 0;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distLeft = Math.abs(estimate - left);
  const distUp = Math.abs(estimate - up);
  const distUpLeft = Math.abs(estimate - upLeft);
  if (distLeft <= distUp && distLeft <= distUpLeft) {
    return left;
  }
  return distUp <= distUpLeft ? up : upLeft;
}
