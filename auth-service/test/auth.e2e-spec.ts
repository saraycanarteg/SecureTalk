import { createHmac, createPrivateKey, generateKeyPairSync, KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/common/security/password-hash';
import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';

const PASSWORD = 'Contrasena-De-Prueba-1';
const ISSUER = 'securetalk-auth-test';
const AUDIENCE = 'securetalk-api-test';

describe('AUTH (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let privateKey: KeyObject;
  let userCounter = 0;

  const server = () => request(app.getHttpServer());

  const createUser = (username: string, overrides: Partial<User> = {}) => {
    userCounter += 1;
    const users = dataSource.getRepository(User);
    return users.save(
      users.create({
        cedula: String(userCounter).padStart(10, '0'),
        nombres: 'Nombre',
        apellidos: 'Apellido',
        fechaNacimiento: '1990-01-01',
        username,
        email: `${username}@example.com`,
        passwordHash,
        ...overrides,
      }),
    );
  };

  const login = (username: string, password = PASSWORD) =>
    server().post('/api/auth/login').send({ username, password });

  const profile = (token?: string) => {
    const req = server().get('/api/auth/profile');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const signToken = (
    subject: string,
    options: { issuer?: string; audience?: string; expiresAt?: number; key?: KeyObject } = {},
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(subject)
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? '5m')
      .setJti('jti-de-prueba')
      .sign(options.key ?? privateKey);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.dropDatabase();
    await dataSource.runMigrations();

    passwordHash = await hashPassword(PASSWORD);
    privateKey = createPrivateKey(readFileSync(process.env.JWT_PRIVATE_KEY_PATH as string));
  });

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE "user_roles", "users", "roles", "login_attempts" CASCADE`,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('emite un JWT EdDSA con los claims exigidos ante credenciales validas', async () => {
      const user = await createUser('ana');

      const res = await login('ana').expect(200);

      expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(decodeProtectedHeader(res.body.accessToken).alg).toBe('EdDSA');

      const claims = decodeJwt(res.body.accessToken);
      expect(claims).toMatchObject({ sub: user.id, iss: ISSUER, aud: AUDIENCE });
      expect(claims.jti).toEqual(expect.any(String));
      expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(900);
    });

    it('responde igual con contrasena invalida, usuario inexistente o inactivo', async () => {
      await createUser('ana');
      await createUser('inactiva', { estado: false });

      const invalidPassword = await login('ana', 'contrasena-incorrecta').expect(401);
      const unknownUser = await login('no-existe').expect(401);
      const inactiveUser = await login('inactiva').expect(401);

      const message = 'Credenciales invalidas';
      expect(invalidPassword.body.message).toBe(message);
      expect(unknownUser.body.message).toBe(message);
      expect(inactiveUser.body.message).toBe(message);
    });

    it('rechaza a un usuario con soft delete', async () => {
      const user = await createUser('borrada');
      await dataSource.getRepository(User).softDelete(user.id);

      await login('borrada').expect(401);
    });

    it('rechaza campos ajenos al contrato', async () => {
      await server()
        .post('/api/auth/login')
        .send({ username: 'ana', password: PASSWORD, admin: true })
        .expect(400);
    });

    it('responde 429 tras 5 fallos, incluso con la contrasena correcta', async () => {
      await createUser('ana');

      for (let i = 0; i < 5; i += 1) {
        await login('ana', 'contrasena-incorrecta').expect(401);
      }

      await login('ana').expect(429);
    });

    it('aplica el mismo limite a una cuenta inexistente', async () => {
      for (let i = 0; i < 5; i += 1) {
        await login('no-existe').expect(401);
      }

      await login('no-existe').expect(429);
    });

    it('no deja pasar mas de 5 intentos simultaneos', async () => {
      await createUser('ana');

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => login('ana', 'contrasena-incorrecta')),
      );
      const statuses = responses.map((res) => res.status);

      expect(statuses.filter((status) => status === 401)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    });

    it('permite entrar de nuevo cuando vence la ventana de 15 minutos', async () => {
      await createUser('ana');
      for (let i = 0; i < 6; i += 1) {
        await login('ana', 'contrasena-incorrecta');
      }

      await dataSource.query(
        `UPDATE "login_attempts" SET "window_started_at" = now() - interval '16 minutes'`,
      );

      await login('ana').expect(200);
    });

    it('un login exitoso reinicia el contador', async () => {
      await createUser('ana');

      for (let i = 0; i < 4; i += 1) {
        await login('ana', 'contrasena-incorrecta').expect(401);
      }
      await login('ana').expect(200);
      for (let i = 0; i < 5; i += 1) {
        await login('ana', 'contrasena-incorrecta').expect(401);
      }
    });

    it('registra los eventos sin contrasenas ni JWT', async () => {
      await createUser('ana');
      const lines: string[] = [];
      const capture = (message: unknown) => {
        lines.push(String(message));
      };
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);

      const res = await login('ana').expect(200);
      await login('ana', 'contrasena-incorrecta').expect(401);
      await profile('token-invalido').expect(401);

      const logged = lines.join('\n');
      expect(logged).toContain('login_exitoso');
      expect(logged).toContain('login_fallido');
      expect(logged).toContain('token_rechazado');
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toContain('contrasena-incorrecta');
      expect(logged).not.toContain(res.body.accessToken);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('devuelve el perfil sin datos sensibles con un token valido', async () => {
      const user = await createUser('ana');
      const { body } = await login('ana').expect(200);

      const res = await profile(body.accessToken).expect(200);

      expect(res.body).toEqual({
        id: user.id,
        username: 'ana',
        email: 'ana@example.com',
        nombres: 'Nombre',
        apellidos: 'Apellido',
      });
    });

    it('responde 401 sin token', async () => {
      await profile().expect(401);
    });

    it('responde 401 con un token expirado', async () => {
      const user = await createUser('ana');
      const expired = await signToken(user.id, {
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });

      await profile(expired).expect(401);
    });

    it('responde 401 con un token manipulado', async () => {
      const victim = await createUser('victima');
      await createUser('ana');
      const { body } = await login('ana').expect(200);
      const [header, payload, signature] = body.accessToken.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, sub: victim.id })).toString('base64url');

      await profile(`${header}.${forged}.${signature}`).expect(401);
    });

    it('responde 401 con emisor o audiencia incorrectos', async () => {
      const user = await createUser('ana');

      await profile(await signToken(user.id, { issuer: 'otro-emisor' })).expect(401);
      await profile(await signToken(user.id, { audience: 'otra-audiencia' })).expect(401);
    });

    it('responde 401 con un token firmado con otra llave', async () => {
      const user = await createUser('ana');
      const otherKey = generateKeyPairSync('ed25519').privateKey;

      await profile(await signToken(user.id, { key: otherKey })).expect(401);
    });

    it('rechaza alg none y HS256 firmado con la llave publica', async () => {
      const user = await createUser('ana');
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const claims = encode({
        sub: user.id,
        iss: ISSUER,
        aud: AUDIENCE,
        iat: now,
        exp: now + 300,
        jti: 'jti-de-prueba',
      });

      const none = `${encode({ alg: 'none' })}.${claims}.`;
      const hsHeader = encode({ alg: 'HS256' });
      const hsSignature = createHmac('sha256', readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string))
        .update(`${hsHeader}.${claims}`)
        .digest('base64url');

      await profile(none).expect(401);
      await profile(`${hsHeader}.${claims}.${hsSignature}`).expect(401);
    });

    it('responde 401 si el usuario se desactiva con el token aun vigente', async () => {
      const user = await createUser('ana');
      const { body } = await login('ana').expect(200);

      await dataSource.getRepository(User).update(user.id, { estado: false });

      await profile(body.accessToken).expect(401);
    });
  });

  describe('modelo user_roles', () => {
    const createRole = (rol: string) => {
      const roles = dataSource.getRepository(Role);
      return roles.save(roles.create({ rol }));
    };

    it('rechaza un par (user_id, role_id) duplicado', async () => {
      const user = await createUser('ana');
      const role = await createRole('ADMIN');
      const userRoles = dataSource.getRepository(UserRole);

      await userRoles.insert({ userId: user.id, roleId: role.id });

      await expect(
        userRoles.insert({ userId: user.id, roleId: role.id }),
      ).rejects.toMatchObject({
        driverError: { code: '23505', constraint: 'UQ_user_roles_user_role' },
      });
      await expect(userRoles.countBy({ userId: user.id })).resolves.toBe(1);
    });

    it('permite la relacion N:M con identificador propio y fecha de asignacion', async () => {
      const ana = await createUser('ana');
      const luis = await createUser('luis');
      const admin = await createRole('ADMIN');
      const analyst = await createRole('ANALYST');
      const userRoles = dataSource.getRepository(UserRole);

      await userRoles.insert([
        { userId: ana.id, roleId: admin.id },
        { userId: ana.id, roleId: analyst.id },
        { userId: luis.id, roleId: admin.id },
      ]);

      const rows = await userRoles.find();
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.id).toEqual(expect.any(String));
        expect(row.assignedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('infraestructura', () => {
    it('expone /health fuera del prefijo /api', async () => {
      const res = await server().get('/health').expect(200);

      expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
      await server().get('/api/health').expect(404);
    });

    it('devuelve el request id y aplica las cabeceras de helmet', async () => {
      const res = await server().get('/health').set('x-request-id', 'mi-request-1').expect(200);

      expect(res.headers['x-request-id']).toBe('mi-request-1');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('documenta en OpenAPI solo lo implementado', async () => {
      const res = await server().get('/api/docs-json').expect(200);

      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/api/auth/login', '/api/auth/profile', '/health']),
      );
      expect(Object.keys(res.body.paths)).not.toContain('/api/users');
    });
  });
});
