import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { RevokedToken } from './../src/auth/entities/revoked-token.entity';
import { hashPassword } from './../src/common/security/password-hash';
import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';
import { createTestApp } from './test-app';

const PASSWORD = 'Contrasena-De-Prueba-1';

describe('POST /api/auth/logout (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let user: User;

  const server = () => request(app.getHttpServer());
  const revoked = () => dataSource.getRepository(RevokedToken);

  const login = async (): Promise<string> => {
    const res = await server()
      .post('/api/auth/login')
      .send({ username: 'ana', password: PASSWORD })
      .expect(200);
    return res.body.accessToken;
  };

  const logout = (token?: string) => {
    const req = server().post('/api/auth/logout');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const profile = (token: string) =>
    server().get('/api/auth/profile').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE "revoked_tokens", "user_roles", "users", "roles", "login_attempts" CASCADE`,
    );
    const users = dataSource.getRepository(User);
    user = await users.save(
      users.create({
        cedula: '1710034065',
        nombres: 'Ana',
        apellidos: 'Perez',
        fechaNacimiento: '1990-01-01',
        username: 'ana',
        email: 'ana@example.com',
        passwordHash,
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 204 y el mismo JWT deja de funcionar', async () => {
    const token = await login();
    await profile(token).expect(200);

    const res = await logout(token).expect(204);

    expect(res.body).toEqual({});
    await profile(token).expect(401);
  });

  it('el token revocado tampoco entra a las rutas administrativas', async () => {
    const roles = dataSource.getRepository(Role);
    const admin = await roles.save(roles.create({ rol: 'ADMIN' }));
    await dataSource.getRepository(UserRole).save({ userId: user.id, roleId: admin.id });
    const token = await login();
    const listUsers = () => server().get('/api/users').set('Authorization', `Bearer ${token}`);
    await listUsers().expect(200);

    await logout(token).expect(204);

    await listUsers().expect(401);
  });

  it('guarda el jti y la expiracion, nunca el JWT', async () => {
    const token = await login();
    const claims = decodeJwt(token);

    await logout(token).expect(204);

    const rows = await revoked().find();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jti: claims.jti, userId: user.id });
    expect(rows[0].expiresAt.getTime()).toBe((claims.exp as number) * 1000);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('solo revoca el token usado, no otras sesiones del usuario', async () => {
    const first = await login();
    const second = await login();

    await logout(first).expect(204);

    await profile(first).expect(401);
    await profile(second).expect(200);
  });

  it('el usuario puede volver a iniciar sesion', async () => {
    await logout(await login()).expect(204);

    await profile(await login()).expect(200);
  });

  it('responde 401 si se repite con el mismo token', async () => {
    const token = await login();
    await logout(token).expect(204);

    await logout(token).expect(401);
  });

  it('logouts simultaneos no generan errores ni filas duplicadas', async () => {
    const token = await login();

    const responses = await Promise.all(Array.from({ length: 5 }, () => logout(token)));

    for (const res of responses) {
      expect([204, 401]).toContain(res.status);
    }
    await expect(revoked().count()).resolves.toBe(1);
  });

  it('responde 401 sin token o con un token invalido', async () => {
    await logout().expect(401);
    await logout('token-invalido').expect(401);

    await expect(revoked().count()).resolves.toBe(0);
  });

  it('elimina las revocaciones de tokens ya vencidos', async () => {
    await revoked().save({
      jti: 'jti-vencido',
      userId: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await logout(await login()).expect(204);

    await expect(revoked().existsBy({ jti: 'jti-vencido' })).resolves.toBe(false);
    await expect(revoked().count()).resolves.toBe(1);
  });

  it('registra el logout y el rechazo sin el JWT', async () => {
    const lines: string[] = [];
    const capture = (message: unknown) => {
      lines.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    const token = await login();

    await logout(token).expect(204);
    await profile(token).expect(401);

    const logged = lines.join('\n');
    expect(logged).toContain(`logout userId=${user.id}`);
    expect(logged).toContain('token_rechazado motivo=revocado');
    expect(logged).not.toContain(token);
  });
});
