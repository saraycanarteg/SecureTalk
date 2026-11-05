import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';

import type { Env } from '../config/env.schema.js';

// Segundo puerto para el canal interno: los clientes siguen usando el HTTP publicado.
export async function startInternalTlsServer(app: NestExpressApplication): Promise<void> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const certPath = config.get('INTERNAL_TLS_CERT_PATH', { infer: true });
  const keyPath = config.get('INTERNAL_TLS_KEY_PATH', { infer: true });
  if (!certPath || !keyPath) {
    return;
  }

  const port = config.get('INTERNAL_TLS_PORT', { infer: true });
  const server = createServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' },
    app.getHttpAdapter().getInstance(),
  );
  server.listen(port);
  await once(server, 'listening');
  new Logger('InternalTls').log(`canal_interno_https puerto=${port}`);
}
