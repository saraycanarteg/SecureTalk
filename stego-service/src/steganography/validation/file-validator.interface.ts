export const FILE_VALIDATOR = Symbol('FILE_VALIDATOR');

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface FileToValidate {
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export type FileValidationResult =
  | { valid: true }
  | { valid: false; statusCode: number; reason: string };

// Debe comprobar extension, magic bytes y tipo de contenido.
export interface FileValidator {
  validate(file: FileToValidate): Promise<FileValidationResult>;
}
