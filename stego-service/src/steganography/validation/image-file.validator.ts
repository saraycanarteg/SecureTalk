import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ImageDecodeError, ImageFormat } from '../image/decoded-image';
import { decodeImage, detectImageFormat } from '../image/image-decoder';
import {
  FileToValidate,
  FileValidationResult,
  FileValidator,
  MAX_FILE_SIZE_BYTES,
} from './file-validator.interface';

const FORMAT_BY_EXTENSION: Record<string, ImageFormat> = {
  '.png': 'png',
  '.bmp': 'bmp',
};

const MIME_TYPES_BY_FORMAT: Record<ImageFormat, string[]> = {
  png: ['image/png'],
  bmp: ['image/bmp', 'image/x-ms-bmp'],
};

const reject = (statusCode: number, reason: string): FileValidationResult => ({
  valid: false,
  statusCode,
  reason,
});

const tooLarge = (reason: string) =>
  reject(HttpStatus.PAYLOAD_TOO_LARGE, reason);
const unsupported = (reason: string) =>
  reject(HttpStatus.UNSUPPORTED_MEDIA_TYPE, reason);
const CORRUPT = reject(
  HttpStatus.BAD_REQUEST,
  'El archivo esta vacio o danado',
);

// La extension y el tipo de contenido los declara el cliente: solo cuentan si coinciden
// con la firma real y si el archivo se puede decodificar por completo.
@Injectable()
export class ImageFileValidator implements FileValidator {
  async validate(file: FileToValidate): Promise<FileValidationResult> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return tooLarge('El archivo supera el tamaño maximo');
    }
    if (file.size === 0) {
      return CORRUPT;
    }

    const format =
      FORMAT_BY_EXTENSION[extname(file.originalName).toLowerCase()];
    if (!format) {
      return unsupported('Solo se admiten archivos .png y .bmp');
    }
    if (!MIME_TYPES_BY_FORMAT[format].includes(file.mimeType.toLowerCase())) {
      return unsupported('El tipo de contenido no coincide con la extension');
    }

    const content = await readFile(file.path);
    if (detectImageFormat(content) !== format) {
      return unsupported('El contenido no coincide con la extension');
    }

    try {
      await decodeImage(content);
    } catch (error) {
      if (!(error instanceof ImageDecodeError)) {
        throw error;
      }
      return error.failure === 'too_large'
        ? tooLarge('La imagen supera el limite de pixeles')
        : CORRUPT;
    }
    return { valid: true };
  }
}
