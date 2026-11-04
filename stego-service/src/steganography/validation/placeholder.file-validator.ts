import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  FileToValidate,
  FileValidationResult,
  FileValidator,
  MAX_FILE_SIZE_BYTES,
} from './file-validator.interface';

// ============================================================================
// TODO(compañero): REEMPLAZAR ESTE PLACEHOLDER POR LA VALIDACION REAL.
// Solo revisa el tamaño. FALTA extension, magic bytes y tipo de contenido (415).
// Para reemplazarlo, crea otra clase que implemente FileValidator y cambia
// useClass del token FILE_VALIDATOR en steganography.module.ts.
// ============================================================================
@Injectable()
export class PlaceholderFileValidator implements FileValidator, OnModuleInit {
  private readonly logger = new Logger(PlaceholderFileValidator.name);

  onModuleInit() {
    this.logger.warn('Validador de archivos PLACEHOLDER activo: solo se revisa el tamaño.');
  }

  async validate(file: FileToValidate): Promise<FileValidationResult> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        reason: 'El archivo supera el tamaño maximo',
      };
    }
    return { valid: true };
  }
}
