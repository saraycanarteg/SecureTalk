import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from './test-app';

const OVERSIZED = 200 * 1024;

describe('Cuerpo de la peticion (e2e)', () => {
  let app: NestExpressApplication;

  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 413 con un JSON demasiado grande, sin autenticar', async () => {
    const res = await server()
      .post('/api/auth/login')
      .send({ username: 'ana', password: 'x'.repeat(OVERSIZED) })
      .expect(413);

    expect(res.body).toMatchObject({ statusCode: 413, requestId: expect.any(String) });
  });

  it('no registra el exceso como un error interno ni guarda el cuerpo', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const secret = `Secreto-${'x'.repeat(OVERSIZED)}`;

    const res = await server()
      .post('/api/auth/login')
      .send({ username: 'ana', password: secret })
      .expect(413);

    expect(error).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('Secreto-');
  });

  it('responde 400 con un JSON mal formado', async () => {
    await server()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":')
      .expect(400);
  });

  it('sigue aceptando un cuerpo de tamano normal', async () => {
    await server()
      .post('/api/auth/login')
      .send({ username: 'no-existe', password: 'Contrasena-1' })
      .expect(401);
  });
});
