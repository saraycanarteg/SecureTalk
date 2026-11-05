import { BMP_SIGNATURE, decodeBmp } from './bmp-decoder';
import { corrupt, DecodedImage, ImageFormat } from './decoded-image';
import { decodePng, PNG_SIGNATURE } from './png-decoder';

const startsWith = (file: Buffer, signature: Buffer) =>
  file.subarray(0, signature.length).equals(signature);

// Identifica el formato por su firma real, sin confiar en lo que declara el cliente.
export function detectImageFormat(file: Buffer): ImageFormat | null {
  if (startsWith(file, PNG_SIGNATURE)) {
    return 'png';
  }
  return startsWith(file, BMP_SIGNATURE) ? 'bmp' : null;
}

export async function decodeImage(file: Buffer): Promise<DecodedImage> {
  switch (detectImageFormat(file)) {
    case 'png':
      return decodePng(file);
    case 'bmp':
      return decodeBmp(file);
    default:
      return corrupt('Formato de imagen desconocido');
  }
}
