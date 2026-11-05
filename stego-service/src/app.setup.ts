import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AccessLogMiddleware } from './common/middleware/access-log/access-log.middleware.js';
import { RequestIdMiddleware } from './common/middleware/request-id/request-id.middleware.js';
import type { Env } from './config/env.schema.js';
import { SteganographyModule } from './steganography/steganography.module';

// Compartido entre main.ts y las pruebas e2e para probar la misma configuracion.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Se registra aqui y no en el modulo para cubrir tambien las rutas inexistentes.
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));
  const accessLog = new AccessLogMiddleware();
  app.use(accessLog.use.bind(accessLog));
  app.use(helmet());

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }
}

function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SecureTalk STEGO')
      .setDescription(
        'Validacion y analisis LSB de imagenes PNG y BMP. Cada operacion verifica el JWT y pide a AUTH una decision de autorizacion vigente.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
    { include: [AppModule, SteganographyModule] },
  );
  SwaggerModule.setup('api/docs', app, document);
}
