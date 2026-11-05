import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { diskStorage } from 'multer';

import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import type { Env } from '../config/env.schema.js';
import { DETECTOR } from './detector/detector.interface';
import { LsbChiSquareDetector } from './detector/lsb-chi-square.detector';
import { Analysis } from './entities/analysis.entity';
import { SteganographyController } from './steganography.controller';
import { SteganographyService } from './steganography.service';
import { FILE_VALIDATOR, MAX_FILE_SIZE_BYTES } from './validation/file-validator.interface';
import { ImageFileValidator } from './validation/image-file.validator';

@Module({
  imports: [
    TypeOrmModule.forFeature([Analysis]),
    AuthModule,
    AuthzModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        storage: diskStorage({
          destination: config.get('UPLOAD_DIR', { infer: true }),
          // El nombre en disco es aleatorio y sin extension: nada del cliente llega a la ruta.
          filename: (_req, _file, callback) => callback(null, randomUUID()),
        }),
        limits: {
          fileSize: MAX_FILE_SIZE_BYTES,
          files: 1,
          fields: 0,
        },
      }),
    }),
  ],
  controllers: [SteganographyController],
  providers: [
    SteganographyService,
    { provide: DETECTOR, useClass: LsbChiSquareDetector },
    { provide: FILE_VALIDATOR, useClass: ImageFileValidator },
  ],
})
export class SteganographyModule {}
