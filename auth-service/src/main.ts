import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env.schema.js';
import { startInternalTlsServer } from './internal-authorization/internal-tls.server';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
  await startInternalTlsServer(app);
}

bootstrap().catch((error: Error) => {
  new Logger('Bootstrap').error(`arranque_fallido: ${error.message}`, error.stack);
  process.exit(1);
});
