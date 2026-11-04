import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Detector, DetectorResult } from './detector.interface';

// ============================================================================
// TODO(compañero): REEMPLAZAR ESTE PLACEHOLDER POR LA DETECCION REAL (LSB).
// No analiza nada: siempre responde "no_concluyente".
// Para reemplazarlo, crea otra clase que implemente Detector y cambia useClass
// del token DETECTOR en steganography.module.ts.
// ============================================================================
@Injectable()
export class PlaceholderDetector implements Detector, OnModuleInit {
  private readonly logger = new Logger(PlaceholderDetector.name);

  onModuleInit() {
    this.logger.warn('Detector PLACEHOLDER activo: no se realiza ningun analisis real.');
  }

  async analyze(_filePath: string): Promise<DetectorResult> {
    return {
      technique: 'pendiente_implementacion',
      status: 'no_concluyente',
      indicators: {},
      limitations: 'Tecnica de deteccion pendiente de implementacion: no se analizo el archivo.',
    };
  }
}
