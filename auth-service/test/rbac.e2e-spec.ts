import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { hashPassword } from './../src/common/security/password-hash';
import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';
import { createTestApp, createTestRole, createTestUser } from './test-app';

const PASSWORD = 'Contrasena-De-Prueba-1';
const SOME_ID = '6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d';

type Method = 'get' | 'post' | 'patch' | 'delete';

const ADMIN_ROUTES: [Method, string][] = [
  ['post', '/api/users'],
  ['get', '/api/users'],
  ['patch', `/api/users/${SOME_ID}`],
  ['post', '/api/roles'],
  ['get', '/api/roles'],
  ['patch', `/api/roles/${SOME_ID}`],
  ['post', '/api/user-roles'],
  ['delete', `/api/user-roles/${SOME_ID}`],
];

describe('RBAC (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let passwordHash: string;

  const server = () => request(app.getHttpServer());
  const createUser = (username: string) => createTestUser(dataSource, username, passwordHash);
  const createRole = (rol: string) => createTestRole(dataSource, rol);

  const grant = (user: User, role: Role) =>
    dataSource.getRepository(UserRole).save({ userId: user.id, roleId: role.id });

  const tokenOf = async (username: string): Promise<string> => {
    const res = await server()
      .post('/api/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return res.body.accessToken;
  };

  const listUsers = (token: string) =>
    server().get('/api/users').set('Authorization', `Bearer ${token}`);

  // Un usuario con el rol indicado y su JWT obtenido por el login real.
  const userWithRole = async (username: string, role: Role) => {
    const user = await createUser(username);
    const assignment = await grant(user, role);
    return { user, assignment, token: await tokenOf(username) };
  };

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    await dataSource.query(`TRUNCATE "user_roles", "users", "roles", "login_attempts" CASCADE`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('401 sin autenticacion valida', () => {
    it.each(ADMIN_ROUTES)('%s %s sin token', async (method, url) => {
      await server()[method](url).expect(401);
    });

    it.each(ADMIN_ROUTES)('%s %s con token invalido', async (method, url) => {
      await server()[method](url).set('Authorization', 'Bearer token-invalido').expect(401);
    });
  });

  describe('403 sin el rol requerido', () => {
    it.each(ADMIN_ROUTES)('T04: rol USER en %s %s', async (method, url) => {
      const { token } = await userWithRole('ana', await createRole('USER'));

      await server()[method](url).set('Authorization', `Bearer ${token}`).expect(403);
    });

    it('rol ANALYST no accede a las rutas administrativas', async () => {
      const { token } = await userWithRole('ana', await createRole('ANALYST'));

      await listUsers(token).expect(403);
    });

    it('un usuario sin roles recibe 403', async () => {
      await createUser('ana');

      await listUsers(await tokenOf('ana')).expect(403);
    });

    it('USER conserva el acceso a su perfil', async () => {
      const { token } = await userWithRole('ana', await createRole('USER'));

      await server().get('/api/auth/profile').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('no acepta permisos enviados por el cliente', async () => {
      const { token } = await userWithRole('ana', await createRole('USER'));

      await listUsers(token).set('X-Roles', 'ADMIN').set('X-User-Role', 'ADMIN').expect(403);
    });

    it('ignora roles incluidos en un JWT con firma valida', async () => {
      await createRole('ADMIN');
      const user = await createUser('ana');
      const forged = await new SignJWT({ roles: ['ADMIN'], role: 'ADMIN' })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setSubject(user.id)
        .setIssuer(process.env.JWT_ISSUER as string)
        .setAudience(process.env.JWT_AUDIENCE as string)
        .setIssuedAt()
        .setExpirationTime('5m')
        .setJti('jti-con-roles')
        .sign(createPrivateKey(readFileSync(process.env.JWT_PRIVATE_KEY_PATH as string)));

      await listUsers(forged).expect(403);
    });
  });

  describe('ADMIN', () => {
    it('accede a las rutas administrativas', async () => {
      const { token } = await userWithRole('admin', await createRole('ADMIN'));

      await listUsers(token).expect(200);
      await server().get('/api/roles').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('un usuario con varios roles accede si uno de ellos lo permite', async () => {
      const admin = await createRole('ADMIN');
      const { user, token } = await userWithRole('ana', await createRole('USER'));
      await grant(user, admin);

      await listUsers(token).expect(200);
    });
  });

  describe('roles vigentes con el mismo JWT', () => {
    it('T07: retirar el rol por la API deniega la siguiente peticion', async () => {
      const admin = await createRole('ADMIN');
      const { token: rootToken } = await userWithRole('root', admin);
      const { assignment, token } = await userWithRole('ana', admin);
      await listUsers(token).expect(200);

      await server()
        .delete(`/api/user-roles/${assignment.id}`)
        .set('Authorization', `Bearer ${rootToken}`)
        .expect(204);

      await listUsers(token).expect(403);
    });

    it('asignar el rol da acceso con el mismo JWT', async () => {
      const { user, token } = await userWithRole('ana', await createRole('USER'));
      await listUsers(token).expect(403);

      await grant(user, await createRole('ADMIN'));

      await listUsers(token).expect(200);
    });

    it('desactivar el rol deniega la siguiente peticion', async () => {
      const admin = await createRole('ADMIN');
      const { token } = await userWithRole('ana', admin);
      await listUsers(token).expect(200);

      await dataSource.getRepository(Role).update(admin.id, { estado: false });

      await listUsers(token).expect(403);
    });

    it('un rol con soft delete no da acceso', async () => {
      const admin = await createRole('ADMIN');
      const { token } = await userWithRole('ana', admin);

      await dataSource.getRepository(Role).softDelete(admin.id);

      await listUsers(token).expect(403);
    });

    it('desactivar al usuario deniega la siguiente peticion', async () => {
      const { user, token } = await userWithRole('ana', await createRole('ADMIN'));
      await listUsers(token).expect(200);

      await dataSource.getRepository(User).update(user.id, { estado: false });

      await listUsers(token).expect(403);
    });

    it('un usuario con soft delete no conserva el acceso', async () => {
      const { user, token } = await userWithRole('ana', await createRole('ADMIN'));

      await dataSource.getRepository(User).softDelete(user.id);

      await listUsers(token).expect(403);
    });
  });

  it('registra las decisiones sin el JWT', async () => {
    const lines: string[] = [];
    const capture = (message: unknown) => {
      lines.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    const { token: adminToken } = await userWithRole('admin', await createRole('ADMIN'));
    const { token: userToken } = await userWithRole('ana', await createRole('USER'));

    await listUsers(adminToken).expect(200);
    await listUsers(userToken).expect(403);

    const logged = lines.join('\n');
    expect(logged).toContain('acceso_permitido');
    expect(logged).toContain('acceso_denegado');
    expect(logged).not.toContain(adminToken);
    expect(logged).not.toContain(userToken);
  });
});
