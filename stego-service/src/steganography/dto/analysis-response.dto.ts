import { ApiProperty } from '@nestjs/swagger';

import type { AnalysisAction, AnalysisStatus } from '../entities/analysis.entity.js';

// Formato del Anexo C.
export class AnalysisResponseDto {
  @ApiProperty({ format: 'uuid' })
  analysis_id!: string;

  @ApiProperty({ format: 'uuid' })
  user_id!: string;

  @ApiProperty({ example: 'muestra.png', description: 'Nombre enviado por el cliente, sin ruta' })
  filename!: string;

  @ApiProperty({ description: 'SHA-256 del archivo en hexadecimal', minLength: 64, maxLength: 64 })
  sha256!: string;

  @ApiProperty({ example: 'lsb_statistical_analysis' })
  technique!: string;

  @ApiProperty({
    enum: ['sin_indicios', 'sospechoso', 'no_concluyente', 'error'],
    description: 'Clasificacion indicativa: sospechoso es un indicio, no una prueba',
  })
  status!: AnalysisStatus;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'anomaly_score es el mayor p-valor chi-cuadrado obtenido; threshold y lower_threshold separan ' +
      'las clasificaciones. Sin datos suficientes, anomaly_score es null. Las variantes que la tecnica ' +
      'no puede analizar solo incluyen image.',
    example: {
      method: 'chi_square_westfeld_pfitzmann',
      anomaly_score: 0.999993,
      threshold: 0.95,
      lower_threshold: 0.05,
      image: { format: 'png', width: 512, height: 384 },
      channels: {
        r: {
          samples: 196608,
          chi_square: 31.472094,
          degrees_of_freedom: 53,
          p_value: 0.991836,
          max_p_value: 0.999993,
          lsb_ones_ratio: 0.49942,
        },
      },
    },
  })
  indicators!: Record<string, unknown>;

  @ApiProperty({
    enum: ['ninguna', 'advertencia', 'cuarentena', 'rechazo'],
    description: 'Politica aplicada segun la clasificacion',
  })
  action!: AnalysisAction;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Resultado indicativo, no concluyente: un resultado sospechoso es un indicio, no una prueba.',
  })
  limitations!: string | null;
}

export class ErrorResponseDto {
  @ApiProperty()
  statusCode!: number;

  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];

  @ApiProperty()
  requestId!: string;
}
