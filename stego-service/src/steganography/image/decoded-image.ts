export type ImageFormat = 'png' | 'bmp';

// Se comprueba antes de reservar memoria o descomprimir: un archivo pequeno no puede
// obligar al servicio a expandir gigabytes de datos (bomba de descompresion).
export const MAX_IMAGE_PIXELS = 16_000_000;

export type ImageDecodeFailure = 'corrupt' | 'too_large';

export class ImageDecodeError extends Error {
  constructor(
    readonly failure: ImageDecodeFailure,
    message: string,
  ) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

export function corrupt(message: string): never {
  throw new ImageDecodeError('corrupt', message);
}

export function assertPixelLimit(width: number, height: number): void {
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new ImageDecodeError(
      'too_large',
      'La imagen supera el limite de pixeles',
    );
  }
}

export interface ColorChannel {
  name: 'r' | 'g' | 'b' | 'gray';
  offset: number;
}

interface ImageInfo {
  format: ImageFormat;
  width: number;
  height: number;
}

// Pixeles de 8 bits por canal, contiguos y en el orden en que estan guardados en el archivo.
// Las inserciones secuenciales siguen ese orden, por eso las filas de un BMP no se invierten.
export interface AnalyzableImage extends ImageInfo {
  analyzable: true;
  samples: Buffer;
  bytesPerPixel: number;
  channels: ColorChannel[];
  // Las filas estan guardadas de abajo hacia arriba, como en un BMP normal.
  bottomUp: boolean;
}

// Archivo integro en una variante que la tecnica LSB no puede interpretar.
export interface UnanalyzableImage extends ImageInfo {
  analyzable: false;
  reason: string;
}

export type DecodedImage = AnalyzableImage | UnanalyzableImage;
