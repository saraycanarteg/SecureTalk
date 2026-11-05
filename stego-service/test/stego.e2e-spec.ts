import { createHash, createHmac, createPrivateKey, KeyObject, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, IncomingHttpHeaders, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { DETECTOR } from './../src/steganography/detector/detector.interface';
import { Analysis } from './../src/steganography/entities/analysis.entity';
import { MAX_IMAGE_PIXELS } from './../src/steganography/image/decoded-image';
import {
  assemblePng,
  buildBmp,
  buildRgbPng,
  pngChunk,
  pngHeader,
  pngOfExactSize,
} from './support/images';

const ISSUER = 'securetalk-auth-test';
const AUDIENCE = 'securetalk-api-test';
const SERVICE_KEY = 'clave-de-servicio-solo-para-pruebas-e2e';
const FAKE_AUTH_PORT = 45871;
const CONTENT = buildRgbPng(4, 4);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHECK_PATH = '/internal/authorization/check';
const DETECTOR_RESULT = {
  technique: 'prueba',
  status: 'no_concluyente',
  indicators: {},
  limitations: 'Resultado de prueba',
};

interface CheckCall {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: any;
}
type FakeHandler = (body: any, res: ServerResponse) => void;

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const decisionFor = (body: any, allowed: unknown) => ({
  subject_id: decodeJwt(body.subject_token).sub,
  action: body.action,
  allowed,
  reason: allowed === true ? 'active_role_grants_permission' : 'missing_permission',
});

const allow: FakeHandler = (body, res) => sendJson(res, 200, decisionFor(body, true));
const deny: FakeHandler = (body, res) => sendJson(res, 200, decisionFor(body, false));

describe('STEGO (e2e)', () => {
  const uploadDir = process.env.UPLOAD_DIR as string;
  const detector = { analyze: jest.fn() };

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let privateKey: KeyObject;
  let fakeAuth: Server;
  let handler: FakeHandler;
  let checks: CheckCall[];

  const startFakeAuth = () =>
    new Promise<void>((resolve) => {
      fakeAuth = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          const body = JSON.parse(raw);
          checks.push({ method: req.method, url: req.url, headers: req.headers, body });
          handler(body, res);
        });
      });
      fakeAuth.listen(FAKE_AUTH_PORT, '127.0.0.1', resolve);
    });

  const stopFakeAuth = () =>
    new Promise<void>((resolve) => {
      fakeAuth.close(() => resolve());
      fakeAuth.closeAllConnections();
    });

  const signToken = (
    subject: string,
    options: { issuer?: string; audience?: string; expiresAt?: number } = {},
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(subject)
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? '5m')
      .setJti(randomUUID())
      .sign(privateKey);

  const server = () => request(app.getHttpServer());

  const analyze = (
    token?: string,
    content: Buffer = CONTENT,
    file: { filename: string; contentType: string } = {
      filename: 'muestra.png',
      contentType: 'image/png',
    },
  ) => {
    const req = server()
      .post('/api/steganography/analyze')
      .attach('file', content, file);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const result = (id: string, token?: string) => {
    const req = server().get(`/api/steganography/results/${id}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const storedFiles = () => readdirSync(uploadDir);
  const recordCount = () => dataSource.getRepository(Analysis).count();

  const expectNothingProcessed = async () => {
    expect(storedFiles()).toEqual([]);
    await expect(recordCount()).resolves.toBe(0);
    expect(detector.analyze).not.toHaveBeenCalled();
  };

  beforeAll(async () => {
    checks = [];
    handler = allow;
    await startFakeAuth();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DETECTOR)
      .useValue(detector)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.dropDatabase();
    await dataSource.runMigrations();

    privateKey = createPrivateKey(readFileSync(process.env.TEST_JWT_PRIVATE_KEY_PATH as string));
  });

  beforeEach(async () => {
    await dataSource.query(`TRUNCATE "analyses"`);
    rmSync(uploadDir, { recursive: true, force: true });
    mkdirSync(uploadDir, { recursive: true });

    checks = [];
    handler = allow;
    detector.analyze.mockReset();
    detector.analyze.mockResolvedValue(DETECTOR_RESULT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await stopFakeAuth();
  });

  describe('T03: autenticacion', () => {
    it('responde 401 sin token', async () => {
      await analyze().expect(401);
      await result(randomUUID()).expect(401);

      expect(checks).toEqual([]);
      await expectNothingProcessed();
    });

    it('responde 401 con un token manipulado', async () => {
      const token = await signToken(randomUUID());
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString('base64url');

      await analyze(`${header}.${forged}.${signature}`).expect(401);

      expect(checks).toEqual([]);
      await expectNothingProcessed();
    });

    it('responde 401 con un token vencido', async () => {
      const token = await signToken(randomUUID(), {
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });

      await analyze(token).expect(401);

      expect(checks).toEqual([]);
      await expectNothingProcessed();
    });

    it('responde 401 con emisor o audiencia incorrectos', async () => {
      await analyze(await signToken(randomUUID(), { issuer: 'otro' })).expect(401);
      await analyze(await signToken(randomUUID(), { audience: 'otra' })).expect(401);

      expect(checks).toEqual([]);
    });

    it('rechaza alg none y HS256 firmado con la llave publica', async () => {
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const claims = encode({
        sub: randomUUID(),
        iss: ISSUER,
        aud: AUDIENCE,
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      });
      const hsHeader = encode({ alg: 'HS256' });
      const hsSignature = createHmac('sha256', readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string))
        .update(`${hsHeader}.${claims}`)
        .digest('base64url');

      await analyze(`${encode({ alg: 'none' })}.${claims}.`).expect(401);
      await analyze(`${hsHeader}.${claims}.${hsSignature}`).expect(401);

      expect(checks).toEqual([]);
      await expectNothingProcessed();
    });
  });

  describe('autorizacion contra AUTH', () => {
    it('envia el contrato del Anexo B con la clave de servicio', async () => {
      const token = await signToken(randomUUID());

      await analyze(token).expect(201);

      expect(checks).toHaveLength(1);
      expect(checks[0].method).toBe('POST');
      expect(checks[0].url).toBe(CHECK_PATH);
      expect(checks[0].headers['x-service-key']).toBe(SERVICE_KEY);
      expect(checks[0].body).toEqual({
        subject_token: token,
        action: 'steganography.analyze',
        resource_id: null,
      });
    });

    it('T04: responde 403 con allowed=false sin recibir el archivo', async () => {
      handler = deny;

      await analyze(await signToken(randomUUID())).expect(403);

      await expectNothingProcessed();
    });

    it('T08: responde 503 con AUTH caido, sin guardar archivo ni registro', async () => {
      await stopFakeAuth();
      try {
        await analyze(await signToken(randomUUID())).expect(503);
        await expectNothingProcessed();
      } finally {
        await startFakeAuth();
      }
    });

    it('T08: responde 503 con timeout, sin guardar archivo ni registro', async () => {
      handler = () => undefined;

      await analyze(await signToken(randomUUID())).expect(503);

      await expectNothingProcessed();
    });

    const invalidResponses: [string, FakeHandler][] = [
      ['error 500', (_body, res) => sendJson(res, 500, { allowed: true })],
      ['error 401 de AUTH', (_body, res) => sendJson(res, 401, { allowed: true })],
      ['exito distinto de 200', (body, res) => sendJson(res, 201, decisionFor(body, true))],
      ['redireccion', (_body, res) => {
        res.writeHead(302, { Location: 'http://127.0.0.1:1/otro' });
        res.end();
      }],
      ['cuerpo que no es JSON', (_body, res) => {
        res.writeHead(200);
        res.end('no-es-json');
      }],
      ['sin allowed', (body, res) => {
        const { allowed: _allowed, ...rest } = decisionFor(body, true);
        sendJson(res, 200, rest);
      }],
      ['sin reason', (body, res) => {
        const { reason: _reason, ...rest } = decisionFor(body, true);
        sendJson(res, 200, rest);
      }],
      ['allowed como texto', (body, res) => sendJson(res, 200, decisionFor(body, 'true'))],
      ['allowed como numero', (body, res) => sendJson(res, 200, decisionFor(body, 1))],
      ['otro usuario', (body, res) =>
        sendJson(res, 200, { ...decisionFor(body, true), subject_id: randomUUID() })],
      ['otra accion', (body, res) =>
        sendJson(res, 200, { ...decisionFor(body, true), action: 'otra.accion' })],
    ];

    it.each(invalidResponses)('falla de forma segura ante %s', async (_name, invalid) => {
      handler = invalid;

      await analyze(await signToken(randomUUID())).expect(503);

      await expectNothingProcessed();
    });

    it('registra cada decision sin JWT completos ni claves', async () => {
      const lines: string[] = [];
      const capture = (message: unknown) => {
        lines.push(String(message));
      };
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
      const token = await signToken(randomUUID());

      await analyze(token).expect(201);
      handler = deny;
      await analyze(token).expect(403);
      handler = (_body, res) => sendJson(res, 500, {});
      await analyze(token).expect(503);

      const logged = lines.join('\n');
      expect(logged).toContain('authz_decision permitido=true');
      expect(logged).toContain('authz_decision permitido=false');
      expect(logged).toContain('authz_no_disponible');
      expect(logged).not.toContain(token);
      expect(logged).not.toContain(SERVICE_KEY);
    });
  });

  describe('POST /api/steganography/analyze', () => {
    it('guarda con nombre aleatorio, registra y responde con el formato del Anexo C', async () => {
      const userId = randomUUID();
      let pathSeen = '';
      detector.analyze.mockImplementation(async (path: string) => {
        pathSeen = path;
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path)).toEqual(CONTENT);
        return DETECTOR_RESULT;
      });

      const res = await analyze(await signToken(userId)).expect(201);

      expect(pathSeen.startsWith(uploadDir)).toBe(true);
      expect(pathSeen).not.toContain('muestra');
      expect(res.body).toEqual({
        analysis_id: expect.any(String),
        user_id: userId,
        filename: 'muestra.png',
        sha256: createHash('sha256').update(CONTENT).digest('hex'),
        technique: 'prueba',
        status: 'no_concluyente',
        indicators: {},
        action: 'advertencia',
        limitations: 'Resultado de prueba',
      });
    });

    it('borra el archivo si no queda en cuarentena', async () => {
      const res = await analyze(await signToken(randomUUID())).expect(201);

      expect(storedFiles()).toEqual([]);
      const saved = await dataSource.getRepository(Analysis).findOneByOrFail({
        id: res.body.analysis_id,
      });
      expect(saved.storedPath).toBeNull();
    });

    it('conserva el archivo en cuarentena sin exponer su ruta', async () => {
      detector.analyze.mockResolvedValue({
        technique: 'prueba',
        status: 'sospechoso',
        indicators: { anomaly_score: 0.82 },
        limitations: 'Resultado indicativo',
      });

      const res = await analyze(await signToken(randomUUID())).expect(201);

      expect(res.body).toMatchObject({ status: 'sospechoso', action: 'cuarentena' });
      expect(res.body).not.toHaveProperty('stored_path');
      expect(storedFiles()).toHaveLength(1);
      const saved = await dataSource.getRepository(Analysis).findOneByOrFail({
        id: res.body.analysis_id,
      });
      expect(saved.storedPath).toBe(join(uploadDir, storedFiles()[0]));
    });

    it('registra status=error si el detector falla y no filtra el detalle', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      detector.analyze.mockRejectedValue(new Error('detalle interno'));

      const res = await analyze(await signToken(randomUUID())).expect(201);

      expect(res.body).toMatchObject({ status: 'error', action: 'rechazo' });
      expect(JSON.stringify(res.body)).not.toContain('detalle interno');
      expect(storedFiles()).toEqual([]);
    });

    it('responde 500 sin detalles y borra el archivo si falla la base de datos', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const save = jest
        .spyOn(dataSource.getRepository(Analysis).constructor.prototype, 'save')
        .mockRejectedValue(new Error('detalle de la base'));

      const res = await analyze(await signToken(randomUUID())).expect(500);
      save.mockRestore();

      expect(JSON.stringify(res.body)).not.toContain('detalle de la base');
      expect(storedFiles()).toEqual([]);
    });

    it('responde 413 si supera 10 MB, sin archivo ni registro', async () => {
      const tooLarge = Buffer.alloc(MAX_FILE_SIZE + 1);

      await analyze(await signToken(randomUUID()), tooLarge).expect(413);

      await expectNothingProcessed();
    });

    it('acepta un archivo de exactamente 10 MB', async () => {
      const limit = pngOfExactSize(MAX_FILE_SIZE);

      await analyze(await signToken(randomUUID()), limit).expect(201);
    });

    it('responde 400 si falta el archivo', async () => {
      await server()
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${await signToken(randomUUID())}`)
        .expect(400);

      await expectNothingProcessed();
    });
  });

  describe('T10: archivos rechazados', () => {
    const png = { filename: 'muestra.png', contentType: 'image/png' };
    const corruptCrc = Buffer.from(CONTENT);
    corruptCrc[corruptCrc.length - 20] ^= 0xff;
    const bomb = assemblePng(
      pngHeader(
        Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1,
        Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1,
      ),
      pngChunk('IDAT', Buffer.alloc(16)),
      pngChunk('IEND'),
    );

    const rejected: [string, number, Buffer, typeof png][] = [
      ['otra extension', 415, CONTENT, { filename: 'virus.exe', contentType: 'image/png' }],
      ['otro tipo de contenido', 415, CONTENT, { filename: 'a.png', contentType: 'text/html' }],
      ['contenido sin firma de imagen', 415, Buffer.from('<script>alert(1)</script>'), png],
      ['BMP renombrado a .png', 415, buildBmp(1, 1, Buffer.alloc(4)), png],
      ['archivo vacio', 400, Buffer.alloc(0), png],
      ['PNG truncado', 400, CONTENT.subarray(0, CONTENT.length - 10), png],
      ['PNG con CRC incorrecto', 400, corruptCrc, png],
      ['PNG con datos anexados', 400, Buffer.concat([CONTENT, Buffer.from('PK')]), png],
      ['bomba de descompresion', 413, bomb, png],
    ];

    it.each(rejected)(
      '%s: responde %i sin analizar, sin guardar y sin registro',
      async (_name, status, content, file) => {
        const res = await analyze(await signToken(randomUUID()), content, file).expect(status);

        expect(res.body).toEqual({
          statusCode: status,
          message: expect.any(String),
          requestId: expect.any(String),
        });
        await expectNothingProcessed();
      },
    );
  });

  describe('GET /api/steganography/results/:id', () => {
    const createAnalysis = async (userId: string) => {
      const res = await analyze(await signToken(userId)).expect(201);
      checks = [];
      return res.body;
    };

    it('devuelve el analisis a su propietario y autoriza con la accion de lectura', async () => {
      const userId = randomUUID();
      const analysis = await createAnalysis(userId);

      const res = await result(analysis.analysis_id, await signToken(userId)).expect(200);

      expect(res.body).toEqual(analysis);
      expect(checks[0].body).toMatchObject({
        action: 'steganography.results.read',
        resource_id: analysis.analysis_id,
      });
    });

    it('T11: responde 403 al consultar un analisis ajeno', async () => {
      const analysis = await createAnalysis(randomUUID());

      const res = await result(analysis.analysis_id, await signToken(randomUUID())).expect(403);

      expect(res.body).not.toHaveProperty('sha256');
    });

    it('responde 404 si no existe', async () => {
      await result(randomUUID(), await signToken(randomUUID())).expect(404);
    });

    it('responde 400 con un identificador invalido', async () => {
      await result('no-es-uuid', await signToken(randomUUID())).expect(400);
    });

    it('responde 403 si AUTH deniega, aunque el analisis sea propio', async () => {
      const userId = randomUUID();
      const analysis = await createAnalysis(userId);
      handler = deny;

      await result(analysis.analysis_id, await signToken(userId)).expect(403);
    });

    it('responde 503 sin devolver datos si AUTH no responde', async () => {
      const userId = randomUUID();
      const analysis = await createAnalysis(userId);
      handler = () => undefined;

      const res = await result(analysis.analysis_id, await signToken(userId)).expect(503);

      expect(res.body).not.toHaveProperty('sha256');
    });
  });

  describe('infraestructura', () => {
    it('expone /health fuera del prefijo /api y aplica helmet', async () => {
      const res = await server().get('/health').expect(200);

      expect(res.body).toEqual({ status: 'ok', service: 'stego-service' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      await server().get('/api/health').expect(404);
    });

    it('documenta los endpoints en OpenAPI', async () => {
      const res = await server().get('/api/docs-json').expect(200);

      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/api/steganography/analyze',
          '/api/steganography/results/{id}',
          '/health',
        ]),
      );
    });
  });
});
