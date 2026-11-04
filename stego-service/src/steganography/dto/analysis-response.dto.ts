import { ApiProperty } from '@nestjs/swagger';

import type { AnalysisAction, AnalysisStatus } from '../entities/analysis.entity.js';

// Formato del Anexo C.
export class AnalysisResponseDto {
  @ApiProperty({ format: 'uuid' })
  analysis_id!: string;

  @ApiProperty({ format: 'uuid' })
  user_id!: string;

  @ApiProperty({ example: 'muestra.png' })
  filename!: string;

  @ApiProperty({ description: 'SHA-256 del archivo en hexadecimal' })
  sha256!: string;

  @ApiProperty({ example: 'pendiente_implementacion' })
  technique!: string;

  @ApiProperty({ enum: ['sin_indicios', 'sospechoso', 'no_concluyente', 'error'] })
  status!: AnalysisStatus;

  @ApiProperty({ type: 'object', additionalProperties: true })
  indicators!: Record<string, unknown>;

  @ApiProperty({ enum: ['ninguna', 'advertencia', 'cuarentena', 'rechazo'] })
  action!: AnalysisAction;

  @ApiProperty({ type: 'string', nullable: true })
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
