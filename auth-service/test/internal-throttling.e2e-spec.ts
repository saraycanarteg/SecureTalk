import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

const LIMIT = 3;
const CHECK_URL = '/internal/authorization/check';

describe('Limite de peticiones y endpoint interno (e2e)', () => {
  let app: NestExpressApplication;

  const server = () => request(app.getHttpServer());

  const check = () =>
    server()
      .post(CHECK_URL)
      .set('X-Service-Key', process.env.STEGO_SERVICE_KEY as string)
      .send({ subject_token: 'token-invalido', action: 'steganography.analyze', resource_id: null });

  beforeAll(async () => {
    // Antes de importar AppModule: ConfigModule lee las variables al cargarse.
    process.env.RATE_LIMIT_MAX = String(LIMIT);
    const { createTestApp } = await import('./test-app');
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('STEGO no agota el limite aunque supere las peticiones permitidas por IP', async () => {
    for (let i = 0; i < LIMIT * 3; i += 1) {
      // 400 es la respuesta a un token invalido: la peticion llego a AUTH y no fue limitada.
      await check().expect(400);
    }
  });

  it('el limite sigue activo en las rutas publicas', async () => {
    const send = () =>
      server().post('/api/auth/login').send({ username: 'nadie', password: 'x' });
    const statuses: number[] = [];

    for (let i = 0; i < LIMIT + 1; i += 1) {
      statuses.push((await send()).status);
    }

    expect(statuses.at(-1)).toBe(429);
  });
});
