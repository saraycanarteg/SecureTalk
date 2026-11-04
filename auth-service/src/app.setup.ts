import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { RequestIdMiddleware } from './common/middleware/request-id/request-id.middleware.js';
import type { Env } from './config/env.schema.js';

// Compartido entre main.ts y las pruebas e2e para probar la misma configuracion.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  // Se registra aqui y no en el modulo para cubrir tambien las rutas inexistentes.
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));
  app.use(helmet());
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });

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

// Solo documenta lo implementado: los modulos de users y roles aun no se incluyen.
function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SecureTalk AUTH')
      .setDescription('Autenticacion con Argon2id y JWT firmado con EdDSA (Ed25519)')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
    { include: [AppModule, AuthModule] },
  );
  SwaggerModule.setup('api/docs', app, document);
}
