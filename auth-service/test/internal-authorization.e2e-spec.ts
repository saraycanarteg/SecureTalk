import { createPrivateKey, generateKeyPairSync, KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { hashPassword } from './../src/common/security/password-hash';
import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';
import { createTestApp } from './test-app';

const PASSWORD = 'Contrasena-De-Prueba-1';
const URL = '/internal/authorization/check';
const ANALYZE = 'steganography.analyze';
const READ_RESULTS = 'steganography.results.read';

describe('POST /internal/authorization/check (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let privateKey: KeyObject;
  let serviceKey: string;
  let userCounter = 0;

  const server = () => request(app.getHttpServer());

  const check = (token: string, action = ANALYZE, resourceId: string | null = null) =>
    server()
      .post(URL)
      .set('X-Service-Key', serviceKey)
      .send({ subject_token: token, action, resource_id: resourceId });

  const createUser = (username: string) => {
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
      }),
    );
  };

  const createRole = (rol: string) => {
    const roles = dataSource.getRepository(Role);
    return roles.save(roles.create({ rol }));
  };

  const login = async (username: string): Promise<string> => {
    const res = await server()
      .post('/api/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return res.body.accessToken;
  };

  // Un usuario con los roles indicados y su JWT obtenido por el login real.
  const userWithRoles = async (username: string, ...roleNames: string[]) => {
    const user = await createUser(username);
    const roles: Role[] = [];
    const assignments: UserRole[] = [];
    for (const name of roleNames) {
      const role = await createRole(name);
      roles.push(role);
      assignments.push(
        await dataSource.getRepository(UserRole).save({ userId: user.id, roleId: role.id }),
      );
    }
    return { user, roles, assignments, token: await login(username) };
  };

  const signToken = (
    subject: string,
    options: { expiresAt?: number; key?: KeyObject; issuer?: string } = {},
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(subject)
      .setIssuer(options.issuer ?? (process.env.JWT_ISSUER as string))
      .setAudience(process.env.JWT_AUDIENCE as string)
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? '5m')
      .setJti('jti-de-prueba')
      .sign(options.key ?? privateKey);

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    passwordHash = await hashPassword(PASSWORD);
    privateKey = createPrivateKey(readFileSync(process.env.JWT_PRIVATE_KEY_PATH as string));
    serviceKey = process.env.STEGO_SERVICE_KEY as string;
  });

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE "revoked_tokens", "user_roles", "users", "roles", "login_attempts" CASCADE`,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autenticacion de STEGO', () => {
    const body = { subject_token: 'x', action: ANALYZE, resource_id: null };

    it('responde 401 sin la cabecera', async () => {
      await server().post(URL).send(body).expect(401);
    });

    it.each([
      ['otra clave del mismo largo', () => 'x'.repeat(serviceKey.length)],
      ['una clave mas corta', () => serviceKey.slice(0, -1)],
      ['una clave mas larga', () => `${serviceKey}x`],
      ['una clave vacia', () => ''],
    ])('responde 401 con %s', async (_motivo, key) => {
      await server().post(URL).set('X-Service-Key', key()).send(body).expect(401);
    });

    it('un JWT de ADMIN no reemplaza a la clave de servicio', async () => {
      const { token } = await userWithRoles('admin', 'ADMIN');

      await server()
        .post(URL)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...body, subject_token: token })
        .expect(401);
    });

    it('comprueba la clave antes de validar el cuerpo', async () => {
      await server().post(URL).send({ campo: 'invalido' }).expect(401);
    });

    it('la ruta no lleva el prefijo /api', async () => {
      await server().post(`/api${URL}`).set('X-Service-Key', serviceKey).send(body).expect(404);
    });
  });

  describe('permite', () => {
    it('responde exactamente lo que pide el contrato', async () => {
      const { user, token } = await userWithRoles('ana', 'ANALYST');

      const res = await check(token).expect(200);

      expect(res.body).toEqual({
        subject_id: user.id,
        action: ANALYZE,
        allowed: true,
        reason: 'active_role_grants_permission',
      });
    });

    it.each([
      ['ADMIN', ANALYZE],
      ['ADMIN', READ_RESULTS],
      ['ANALYST', ANALYZE],
      ['ANALYST', READ_RESULTS],
    ])('%s en %s', async (role, action) => {
      const { token } = await userWithRoles('ana', role);

      const res = await check(token, action).expect(200);

      expect(res.body.allowed).toBe(true);
    });

    it('un usuario con USER y ANALYST acumula el permiso', async () => {
      const { token } = await userWithRoles('ana', 'USER', 'ANALYST');

      const res = await check(token).expect(200);

      expect(res.body.allowed).toBe(true);
    });

    it.each([
      ['un UUID', '6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d'],
      ['un texto sin validar', 'no-es-un-uuid'],
    ])('acepta resource_id con %s', async (_motivo, resourceId) => {
      const { token } = await userWithRoles('ana', 'ANALYST');

      const res = await check(token, READ_RESULTS, resourceId).expect(200);

      expect(res.body.allowed).toBe(true);
    });
  });

  describe('deniega con HTTP 200', () => {
    const expectDenied = (
      res: request.Response,
      subjectId: string,
      reason: string,
      action = ANALYZE,
    ) => {
      expect(res.body).toEqual({ subject_id: subjectId, action, allowed: false, reason });
      expect(res.body.allowed).toBe(false);
    };

    it.each([ANALYZE, READ_RESULTS])('T04: usuario con rol USER en %s', async (action) => {
      const { user, token } = await userWithRoles('ana', 'USER');

      const res = await check(token, action).expect(200);

      expectDenied(res, user.id, 'no_active_role_grants_permission', action);
    });

    it('usuario sin roles', async () => {
      const user = await createUser('ana');

      const res = await check(await login('ana')).expect(200);

      expectDenied(res, user.id, 'no_active_role_grants_permission');
    });

    it('rol no incluido en la matriz, aunque tenga un nombre parecido', async () => {
      const { user, token } = await userWithRoles('ana', 'ANALYST_JUNIOR');

      const res = await check(token).expect(200);

      expectDenied(res, user.id, 'no_active_role_grants_permission');
    });

    it('T07: rol retirado con el mismo JWT vigente', async () => {
      const { user, assignments, token } = await userWithRoles('ana', 'ANALYST');
      expect((await check(token).expect(200)).body.allowed).toBe(true);

      await dataSource.getRepository(UserRole).delete(assignments[0].id);

      expectDenied(await check(token).expect(200), user.id, 'no_active_role_grants_permission');
    });

    it('rol desactivado', async () => {
      const { user, roles, token } = await userWithRoles('ana', 'ANALYST');

      await dataSource.getRepository(Role).update(roles[0].id, { estado: false });

      expectDenied(await check(token).expect(200), user.id, 'no_active_role_grants_permission');
    });

    it('usuario inactivo', async () => {
      const { user, token } = await userWithRoles('ana', 'ANALYST');

      await dataSource.getRepository(User).update(user.id, { estado: false });

      expectDenied(await check(token).expect(200), user.id, 'user_inactive');
    });

    it('usuario con soft delete', async () => {
      const { user, token } = await userWithRoles('ana', 'ANALYST');

      await dataSource.getRepository(User).softDelete(user.id);

      expectDenied(await check(token).expect(200), user.id, 'user_inactive');
    });

    it('usuario que ya no existe', async () => {
      const subject = '6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d';

      const res = await check(await signToken(subject)).expect(200);

      expectDenied(res, subject, 'user_inactive');
    });

    it('token revocado por logout', async () => {
      const { user, token } = await userWithRoles('ana', 'ANALYST');
      await server().post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);

      expectDenied(await check(token).expect(200), user.id, 'token_revoked');
    });

    it('token vencido con firma valida', async () => {
      const { user } = await userWithRoles('ana', 'ANALYST');
      const expired = await signToken(user.id, { expiresAt: Math.floor(Date.now() / 1000) - 60 });

      expectDenied(await check(expired).expect(200), user.id, 'token_expired');
    });

    it.each(['steganography.delete', 'admin', 'constructor', '__proto__'])(
      'accion desconocida %s, aunque sea ADMIN',
      async (action) => {
        const { user, token } = await userWithRoles('ana', 'ADMIN');

        const res = await check(token, action).expect(200);

        expectDenied(res, user.id, 'unknown_action', action);
      },
    );
  });

  describe('sin decision: responde un error que STEGO trata como 503', () => {
    it('token manipulado', async () => {
      const { token } = await userWithRoles('ana', 'ADMIN');
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'otro' })).toString('base64url');

      await check(`${header}.${forged}.${signature}`).expect(400);
    });

    it('token firmado con otra llave', async () => {
      const { user } = await userWithRoles('ana', 'ADMIN');
      const otherKey = generateKeyPairSync('ed25519').privateKey;

      await check(await signToken(user.id, { key: otherKey })).expect(400);
    });

    it('token de otro emisor', async () => {
      const { user } = await userWithRoles('ana', 'ADMIN');

      await check(await signToken(user.id, { issuer: 'otro-emisor' })).expect(400);
    });

    it('texto que no es un JWT', async () => {
      await check('token-invalido').expect(400);
    });
  });

  describe('cuerpo', () => {
    it.each([
      ['sin subject_token', { action: ANALYZE }],
      ['sin action', { subject_token: 'x' }],
      ['tipos incorrectos', { subject_token: 1, action: true }],
    ])('responde 400 %s', async (_motivo, body) => {
      await server().post(URL).set('X-Service-Key', serviceKey).send(body).expect(400);
    });

    it('no acepta permisos enviados en el cuerpo', async () => {
      const { token } = await userWithRoles('ana', 'USER');

      await server()
        .post(URL)
        .set('X-Service-Key', serviceKey)
        .send({ subject_token: token, action: ANALYZE, roles: ['ADMIN'], allowed: true })
        .expect(400);
    });
  });

  describe('registro', () => {
    const captureLogs = () => {
      const lines: string[] = [];
      const capture = (message: unknown) => {
        lines.push(String(message));
      };
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
      return lines;
    };

    it('registra cada decision sin el JWT ni la clave', async () => {
      const lines = captureLogs();
      const { user: analyst, token: allowedToken } = await userWithRoles('ana', 'ANALYST');
      const { user: other, token: deniedToken } = await userWithRoles('luis', 'USER');

      await check(allowedToken).expect(200);
      await check(deniedToken).expect(200);
      await check('token-invalido').expect(400);
      await server().post(URL).set('X-Service-Key', 'clave-incorrecta').send({}).expect(401);

      const logged = lines.join('\n');
      expect(logged).toContain(
        `autorizacion_decision permitido=true motivo=active_role_grants_permission userId=${analyst.id}`,
      );
      expect(logged).toContain(
        `autorizacion_decision permitido=false motivo=no_active_role_grants_permission userId=${other.id}`,
      );
      expect(logged).toContain('autorizacion_sin_decision');
      expect(logged).toContain('servicio_rechazado motivo=incorrecta');
      expect(logged).not.toContain(allowedToken);
      expect(logged).not.toContain(deniedToken);
      expect(logged).not.toContain('token-invalido');
      expect(logged).not.toContain(serviceKey);
      expect(logged).not.toContain('clave-incorrecta');
    });

    it('un salto de linea en la accion o el recurso no crea otra linea en el log', async () => {
      const lines = captureLogs();
      const { token } = await userWithRoles('ana', 'ANALYST');
      lines.length = 0;

      await check(token, 'x\nacceso_permitido falso', 'y\nfalso').expect(200);

      const decision = lines.find((line) => line.startsWith('autorizacion_decision'));
      expect(decision).toBeDefined();
      expect(decision).not.toContain('\n');
    });
  });
});
