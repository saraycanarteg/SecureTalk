import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { resolveAction } from './action-policy';
import { DETECTOR } from './detector/detector.interface';
import type { Detector, DetectorResult } from './detector/detector.interface';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { Analysis } from './entities/analysis.entity';
import { QuarantineStore } from './quarantine/quarantine.store';
import { FILE_VALIDATOR } from './validation/file-validator.interface';
import type { FileValidator } from './validation/file-validator.interface';

const MAX_FILENAME_LENGTH = 255;

export interface AnalyzeContext {
  userId: string;
  requestId?: string;
}

@Injectable()
export class SteganographyService {
  private readonly logger = new Logger(SteganographyService.name);

  constructor(
    @InjectRepository(Analysis)
    private readonly analyses: Repository<Analysis>,
    @Inject(DETECTOR)
    private readonly detector: Detector,
    @Inject(FILE_VALIDATOR)
    private readonly validator: FileValidator,
    private readonly quarantine: QuarantineStore,
  ) {}

  async analyze(
    file: Express.Multer.File | undefined,
    context: AnalyzeContext,
  ): Promise<AnalysisResponseDto> {
    if (!file) {
      this.logRejection(HttpStatus.BAD_REQUEST, 'Falta el archivo', context);
      throw new BadRequestException('Falta el archivo en el campo "file"');
    }

    let currentPath = file.path;
    let keepFile = false;
    try {
      const validation = await this.validator.validate({
        path: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
      if (!validation.valid) {
        this.logRejection(validation.statusCode, validation.reason, context);
        throw new HttpException(validation.reason, validation.statusCode);
      }

      const sha256 = await this.hashFile(file.path);
      const result = await this.runDetector(file.path, context);
      const action = resolveAction(result.status);
      const storedPath =
        action === 'cuarentena' ? await this.quarantine.move(file.path) : null;
      currentPath = storedPath ?? currentPath;

      const analysis = await this.analyses.save(
        this.analyses.create({
          userId: context.userId,
          filename: this.sanitizeFilename(file.originalname),
          sha256,
          technique: result.technique,
          indicators: result.indicators,
          status: result.status,
          action,
          limitations: result.limitations,
          storedPath,
        }),
      );
      keepFile = storedPath !== null;

      this.logger.log(
        `analisis_registrado id=${analysis.id} userId=${analysis.userId} sha256=${analysis.sha256} estado=${analysis.status} accion=${analysis.action} requestId=${context.requestId}`,
      );
      if (keepFile) {
        this.logger.warn(
          `cuarentena_aplicada analisis=${analysis.id} userId=${analysis.userId} sha256=${analysis.sha256} requestId=${context.requestId}`,
        );
      }
      return this.toResponse(analysis);
    } finally {
      if (!keepFile) {
        await this.removeFile(currentPath, context);
      }
    }
  }

  async getResult(id: string, context: AnalyzeContext): Promise<AnalysisResponseDto> {
    const analysis = await this.analyses.findOneBy({ id });
    if (!analysis) {
      this.logger.warn(
        `resultado_inexistente analisis=${id} userId=${context.userId} requestId=${context.requestId}`,
      );
      throw new NotFoundException('Analisis no encontrado');
    }

    if (analysis.userId !== context.userId) {
      this.logger.warn(
        `acceso_ajeno_rechazado analisis=${id} userId=${context.userId} requestId=${context.requestId}`,
      );
      throw new ForbiddenException('Operacion no autorizada');
    }

    this.logger.log(
      `resultado_consultado analisis=${id} userId=${context.userId} requestId=${context.requestId}`,
    );
    return this.toResponse(analysis);
  }

  // JSON.stringify evita inyectar lineas en el log. El nombre del archivo nunca se registra.
  private logRejection(
    statusCode: number,
    reason: string,
    context: AnalyzeContext,
  ) {
    this.logger.warn(
      `archivo_rechazado codigo=${statusCode} motivo=${JSON.stringify(reason)} userId=${context.userId} requestId=${context.requestId}`,
    );
  }

  // Un fallo del detector es una clasificacion mas: queda registrado y el archivo se rechaza.
  private async runDetector(
    filePath: string,
    context: AnalyzeContext,
  ): Promise<DetectorResult> {
    try {
      return await this.detector.analyze(filePath);
    } catch (error) {
      this.logger.error(
        `detector_fallido requestId=${context.requestId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        technique: 'desconocida',
        status: 'error',
        indicators: {},
        limitations: 'El analisis no pudo completarse.',
      };
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
  }

  // El nombre lo envia el cliente: se conserva solo como dato, nunca como ruta en disco.
  private sanitizeFilename(originalName: string): string {
    const name = basename(originalName.replace(/\\/g, '/'))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, MAX_FILENAME_LENGTH);
    return name || 'archivo';
  }

  private async removeFile(filePath: string, context: AnalyzeContext) {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      this.logger.error(
        `archivo_no_eliminado requestId=${context.requestId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // stored_path no se expone: revela la estructura interna del servidor.
  private toResponse(analysis: Analysis): AnalysisResponseDto {
    return {
      analysis_id: analysis.id,
      user_id: analysis.userId,
      filename: analysis.filename,
      sha256: analysis.sha256,
      technique: analysis.technique,
      status: analysis.status,
      indicators: analysis.indicators,
      action: analysis.action,
      limitations: analysis.limitations,
    };
  }
}
