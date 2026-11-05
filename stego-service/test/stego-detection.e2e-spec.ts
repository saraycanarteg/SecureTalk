import { createHash, createPrivateKey, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { join } from 'node:path';

import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { Analysis } from './../src/steganography/entities/analysis.entity';

const SAMPLES_DIR = join(__dirname, '..', '..', 'samples');
const FAKE_AUTH_PORT = 45871;

const mimeType = (name: string) =>
  name.endsWith('.png') ? 'image/png' : 'image/bmp';

// T09 con el detector real: recorre todo el servicio con las muestras de /samples.
describe('T09: analisis de muestras originales y con carga LSB (e2e)', () => {
  const quarantineDir = process.env.QUARANTINE_DIR as string;

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fakeAuth: Server;
  let token: string;
  let userId: string;

  const analyzeSample = (name: string) =>
    request(app.getHttpServer())
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', readFileSync(join(SAMPLES_DIR, name)), {
        filename: name,
        contentType: mimeType(name),
      })
      .expect(201);

  const quarantined = () => readdirSync(quarantineDir);
  const sha256 = (content: Buffer) =>
    createHash('sha256').update(content).digest('hex');

  beforeAll(async () => {
    fakeAuth = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const body = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            subject_id: decodeJwt(body.subject_token).sub,
            action: body.action,
            allowed: true,
            reason: 'active_role_grants_permission',
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      fakeAuth.listen(FAKE_AUTH_PORT, '127.0.0.1', resolve),
    );

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.dropDatabase();
    await dataSource.runMigrations();

    userId = randomUUID();
    token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(userId)
      .setIssuer(process.env.JWT_ISSUER as string)
      .setAudience(process.env.JWT_AUDIENCE as string)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti(randomUUID())
      .sign(
        createPrivateKey(
          readFileSync(process.env.TEST_JWT_PRIVATE_KEY_PATH as string),
        ),
      );
  });

  beforeEach(() => {
    for (const name of quarantined()) {
      rmSync(join(quarantineDir, name), { force: true });
    }
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      fakeAuth.close(() => resolve());
      fakeAuth.closeAllConnections();
    });
  });

  it.each(['original.png', 'original.bmp'])(
    '%s: sin indicios, sin accion y sin conservar el archivo',
    async (name) => {
      const { body } = await analyzeSample(name);

      expect(body).toMatchObject({
        user_id: userId,
        filename: name,
        sha256: sha256(readFileSync(join(SAMPLES_DIR, name))),
        technique: 'lsb_statistical_analysis',
        status: 'sin_indicios',
        action: 'ninguna',
      });
      expect(body.indicators.anomaly_score).toBeLessThan(
        body.indicators.lower_threshold,
      );
      expect(body.limitations).toContain('Resultado indicativo');
      expect(quarantined()).toEqual([]);
    },
  );

  it.each([
    'lsb-100.png',
    'lsb-100.bmp',
    'lsb-25.png',
    'lsb-texto-plano-25.png',
  ])('%s: sospechoso y en cuarentena', async (name) => {
    const content = readFileSync(join(SAMPLES_DIR, name));

    const { body } = await analyzeSample(name);

    expect(body).toMatchObject({
      status: 'sospechoso',
      action: 'cuarentena',
      sha256: sha256(content),
    });
    expect(body.indicators.anomaly_score).toBeGreaterThanOrEqual(
      body.indicators.threshold,
    );
    expect(body.limitations).toContain('un indicio, no una prueba');

    const [stored, ...others] = quarantined();
    expect(others).toEqual([]);
    expect(readFileSync(join(quarantineDir, stored))).toEqual(content);
  });

  it('limitacion documentada: una carga dispersa del 10 % no se detecta', async () => {
    const { body } = await analyzeSample('lsb-disperso-10.png');

    expect(body).toMatchObject({ status: 'sin_indicios', action: 'ninguna' });
    expect(body.limitations).toContain('cargas pequenas o dispersas');
  });

  it('el mismo contenido da metricas distintas con y sin carga, y se pueden consultar', async () => {
    const original = (await analyzeSample('original.png')).body;
    const stego = (await analyzeSample('lsb-100.png')).body;

    expect(stego.sha256).not.toBe(original.sha256);
    expect(stego.indicators.anomaly_score).toBeGreaterThan(
      original.indicators.anomaly_score,
    );
    for (const channel of ['r', 'g', 'b']) {
      // La carga iguala los pares de valores: el estadistico cae con todo el canal.
      expect(stego.indicators.channels[channel].chi_square).toBeLessThan(
        original.indicators.channels[channel].chi_square,
      );
      expect(stego.indicators.channels[channel].p_value).toBeGreaterThan(
        original.indicators.channels[channel].p_value,
      );
    }

    const read = await request(app.getHttpServer())
      .get(`/api/steganography/results/${stego.analysis_id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(read.body).toEqual(stego);

    const saved = await dataSource.getRepository(Analysis).findOneByOrFail({
      id: stego.analysis_id,
    });
    expect(saved).toMatchObject({
      userId,
      sha256: stego.sha256,
      technique: 'lsb_statistical_analysis',
      status: 'sospechoso',
      action: 'cuarentena',
    });
    expect(saved.createdAt).toBeInstanceOf(Date);
  });
});
