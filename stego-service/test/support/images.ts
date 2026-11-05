import { crc32, deflateSync } from 'node:zlib';

// Generadores de imagenes para las pruebas: permiten fabricar archivos validos y danados.

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export const PNG_COLOR = {
  GRAY: 0,
  RGB: 2,
  PALETTE: 3,
  GRAY_ALPHA: 4,
  RGBA: 6,
};

export function pngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function pngHeader(
  width: number,
  height: number,
  options: { bitDepth?: number; colorType?: number; interlace?: number } = {},
): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = options.bitDepth ?? 8;
  data[9] = options.colorType ?? PNG_COLOR.RGB;
  data[12] = options.interlace ?? 0;
  return pngChunk('IHDR', data);
}

export function assemblePng(...chunks: Buffer[]): Buffer {
  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

// Las filas ya incluyen su byte de filtro.
export function buildPng(
  width: number,
  height: number,
  scanlines: Buffer,
  options: {
    bitDepth?: number;
    colorType?: number;
    interlace?: number;
    extraChunks?: Buffer[];
  } = {},
): Buffer {
  return assemblePng(
    pngHeader(width, height, options),
    ...(options.extraChunks ?? []),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  );
}

// Filas sin filtrar a partir de una funcion que da los bytes de cada pixel.
export function rawScanlines(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[],
): Buffer {
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    for (let x = 0; x < width; x++) {
      rows.push(...pixel(x, y));
    }
  }
  return Buffer.from(rows);
}

export function buildRgbPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[] = (x, y) => [
    x & 0xff,
    y & 0xff,
    (x + y) & 0xff,
  ],
): Buffer {
  return buildPng(width, height, rawScanlines(width, height, pixel));
}

// PNG valido de exactamente `size` bytes, con relleno en un chunk auxiliar.
export function pngOfExactSize(size: number): Buffer {
  const base = buildRgbPng(2, 2);
  const padding = size - base.length - 12;
  const end = base.length - 12;
  return Buffer.concat([
    base.subarray(0, end),
    pngChunk('tEXt', Buffer.alloc(padding, 0x20)),
    base.subarray(end),
  ]);
}

export function buildBmp(
  width: number,
  height: number,
  pixelData: Buffer,
  options: { bitCount?: number; compression?: number; topDown?: boolean } = {},
): Buffer {
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'latin1');
  header.writeUInt32LE(54 + pixelData.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(options.topDown ? -height : height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(options.bitCount ?? 24, 28);
  header.writeUInt32LE(options.compression ?? 0, 30);
  header.writeUInt32LE(pixelData.length, 34);
  return Buffer.concat([header, pixelData]);
}
