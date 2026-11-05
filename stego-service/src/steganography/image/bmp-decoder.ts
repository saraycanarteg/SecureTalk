import { assertPixelLimit, corrupt, DecodedImage } from './decoded-image';

export const BMP_SIGNATURE = Buffer.from('BM', 'latin1');

const FILE_HEADER_SIZE = 14;
const VALID_DIB_SIZES = new Set([40, 52, 56, 108, 124]);
const VALID_BIT_COUNTS = new Set([1, 4, 8, 16, 24, 32]);

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const MAX_COMPRESSION = 6;

// Algunos programas rellenan el archivo hasta un multiplo de 4 bytes.
const MAX_TRAILING_PADDING = 3;

export function decodeBmp(file: Buffer): DecodedImage {
  if (file.length < FILE_HEADER_SIZE + 40) {
    corrupt('BMP truncado');
  }

  const pixelOffset = file.readUInt32LE(10);
  const dibSize = file.readUInt32LE(14);
  const width = file.readInt32LE(18);
  const signedHeight = file.readInt32LE(22);
  const planes = file.readUInt16LE(26);
  const bitCount = file.readUInt16LE(28);
  const compression = file.readUInt32LE(30);

  if (
    !VALID_DIB_SIZES.has(dibSize) ||
    width <= 0 ||
    signedHeight === 0 ||
    planes !== 1 ||
    !VALID_BIT_COUNTS.has(bitCount) ||
    compression > MAX_COMPRESSION
  ) {
    corrupt('Cabecera BMP invalida');
  }

  const height = Math.abs(signedHeight);
  assertPixelLimit(width, height);

  if (pixelOffset < FILE_HEADER_SIZE + dibSize || pixelOffset >= file.length) {
    corrupt('Posicion de los pixeles de BMP invalida');
  }

  const info = { format: 'bmp' as const, width, height };
  const uncompressed = compression === BI_RGB || compression === BI_BITFIELDS;
  if (!uncompressed) {
    return {
      ...info,
      analyzable: false,
      reason: 'BMP comprimido: la tecnica solo admite pixeles sin comprimir',
    };
  }

  // Cada fila ocupa un multiplo de 4 bytes.
  const rowSize = Math.floor((bitCount * width + 31) / 32) * 4;
  const pixelEnd = pixelOffset + rowSize * height;
  if (pixelEnd > file.length) {
    corrupt('BMP truncado');
  }
  if (file.length - pixelEnd > MAX_TRAILING_PADDING) {
    corrupt('BMP con datos despues de los pixeles');
  }

  if (compression !== BI_RGB || (bitCount !== 24 && bitCount !== 32)) {
    return {
      ...info,
      analyzable: false,
      reason: `BMP de ${bitCount} bits: la tecnica solo admite color directo de 24 o 32 bits`,
    };
  }

  const bytesPerPixel = bitCount / 8;
  const stride = width * bytesPerPixel;
  const samples = Buffer.allocUnsafe(height * stride);
  for (let row = 0; row < height; row++) {
    const start = pixelOffset + row * rowSize;
    file.copy(samples, row * stride, start, start + stride);
  }

  return {
    ...info,
    analyzable: true,
    samples,
    bytesPerPixel,
    bottomUp: signedHeight > 0,
    channels: [
      { name: 'r', offset: 2 },
      { name: 'g', offset: 1 },
      { name: 'b', offset: 0 },
    ],
  };
}
