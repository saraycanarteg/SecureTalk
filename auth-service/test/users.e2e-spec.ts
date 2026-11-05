import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { verifyPassword } from './../src/common/security/password-hash';
import { User } from './../src/users/entities/user.entity';
import { createAdminToken, createTestApp } from './test-app';

const validUser = {
  cedula: '1710034065',
  nombres: 'Ana',
  apellidos: 'Perez',
  fechaNacimiento: '1990-01-31',
  username: 'ana.perez',
  email: 'ana@example.com',
  password: 'Contrasena-1',
};

const otherUser = {
  ...validUser,
  cedula: '0926687856',
  username: 'luis',
  email: 'luis@example.com',
};

describe('/api/users (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let adminToken: string;

  const server = () => request(app.getHttpServer());
  const admin = () =>
    request.agent(app.getHttpServer()).set('Authorization', `Bearer ${adminToken}`);
  const post = (body: object) => admin().post('/api/users').send(body);
  const login = (username: string, password: string) =>
    server().post('/api/auth/login').send({ username, password });

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await dataSource.query(`TRUNCATE "users", "roles", "login_attempts" CASCADE`);
    adminToken = await createAdminToken(app, dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST', () => {
    it('crea el usuario y guarda la contrasena con Argon2id', async () => {
      const res = await post(validUser).expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        username: 'ana.perez',
        email: 'ana@example.com',
        estado: true,
      });

      const stored = await dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: res.body.id })
        .getOneOrFail();
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      await expect(verifyPassword(stored.passwordHash, validUser.password)).resolves.toBe(true);
    });

    it('nunca devuelve la contrasena ni su hash', async () => {
      const res = await post(validUser).expect(201);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password_hash');
    });

    it('el usuario creado puede iniciar sesion', async () => {
      await post(validUser).expect(201);

      await login(validUser.username, validUser.password).expect(200);
    });

    it.each([
      ['cedula con digito verificador incorrecto', { cedula: '1710034064' }],
      ['cedula con letras', { cedula: '17100340a5' }],
      ['contrasena corta', { password: 'Ab1!' }],
      ['contrasena con solo 2 tipos', { password: 'abcdefgh1' }],
      ['email invalido', { email: 'no-es-email' }],
      ['username con caracteres no permitidos', { username: 'ana perez' }],
      ['fecha invalida', { fechaNacimiento: '1990-02-31' }],
      ['campo ajeno al contrato', { admin: true }],
      ['estado al crear', { estado: false }],
    ])('responde 400 con %s', async (_motivo, change) => {
      await post({ ...validUser, ...change }).expect(400);

      await expect(dataSource.getRepository(User).count()).resolves.toBe(1);
    });

    it.each([
      ['username', { username: validUser.username }, 'El username ya existe'],
      ['email', { email: validUser.email }, 'El email ya existe'],
      ['cedula', { cedula: validUser.cedula }, 'La cedula ya existe'],
    ])('responde 409 si el %s ya existe', async (_campo, change, message) => {
      await post(validUser).expect(201);

      const res = await post({ ...otherUser, ...change }).expect(409);

      expect(res.body.message).toBe(message);
      await expect(dataSource.getRepository(User).count()).resolves.toBe(2);
    });

    it('trata el email sin distinguir mayusculas', async () => {
      await post(validUser).expect(201);

      await post({ ...otherUser, email: 'ANA@example.com' }).expect(409);
    });
  });

  describe('GET', () => {
    it('pagina el listado sin exponer hashes', async () => {
      await post(validUser).expect(201);
      await post(otherUser).expect(201);

      const first = await admin().get('/api/users?page=1&limit=1').expect(200);
      const second = await admin().get('/api/users?page=2&limit=1').expect(200);

      expect(first.body).toMatchObject({ page: 1, limit: 1, total: 3 });
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
      expect(JSON.stringify(first.body)).not.toContain('argon2');
    });

    it('aplica valores por defecto', async () => {
      const res = await admin().get('/api/users').expect(200);

      expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(res.body.data).toHaveLength(1);
    });

    it.each(['page=0', 'limit=0', 'limit=101', 'page=abc'])('responde 400 con %s', async (query) => {
      await admin().get(`/api/users?${query}`).expect(400);
    });
  });

  describe('PATCH /:id', () => {
    const patch = (id: string, body: object) => admin().patch(`/api/users/${id}`).send(body);

    it('actualiza los campos enviados', async () => {
      const { body: user } = await post(validUser).expect(201);

      const res = await patch(user.id, { nombres: 'Ana Maria' }).expect(200);

      expect(res.body).toMatchObject({ nombres: 'Ana Maria', apellidos: 'Perez' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('desactiva sin borrar y el usuario ya no puede iniciar sesion', async () => {
      const { body: user } = await post(validUser).expect(201);

      const res = await patch(user.id, { estado: false }).expect(200);

      expect(res.body.estado).toBe(false);
      await expect(dataSource.getRepository(User).countBy({ id: user.id })).resolves.toBe(1);
      await login(validUser.username, validUser.password).expect(401);
    });

    it('cambia la contrasena aplicando la politica', async () => {
      const { body: user } = await post(validUser).expect(201);

      await patch(user.id, { password: 'debil' }).expect(400);
      await patch(user.id, { password: 'Nueva-Clave-2' }).expect(200);

      await login(validUser.username, validUser.password).expect(401);
      await login(validUser.username, 'Nueva-Clave-2').expect(200);
    });

    it('conserva el hash si no se envia contrasena', async () => {
      const { body: user } = await post(validUser).expect(201);

      await patch(user.id, { nombres: 'Otra' }).expect(200);

      await login(validUser.username, validUser.password).expect(200);
    });

    it('valida la cedula si viene en el cuerpo', async () => {
      const { body: user } = await post(validUser).expect(201);

      await patch(user.id, { cedula: '1710034064' }).expect(400);
    });

    it('responde 400 con null en vez de fallar en la base de datos', async () => {
      const { body: user } = await post(validUser).expect(201);

      await patch(user.id, { email: null }).expect(400);
      await patch(user.id, { nombres: null }).expect(400);
      await patch(user.id, { estado: null }).expect(400);
    });

    it('responde 409 si el username ya pertenece a otro usuario', async () => {
      const { body: user } = await post(validUser).expect(201);
      await post(otherUser).expect(201);

      await patch(user.id, { username: otherUser.username }).expect(409);
    });

    it('responde 404 si no existe y 400 si el identificador no es UUID', async () => {
      await patch('6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d', { nombres: 'Ana' }).expect(404);
      await patch('123', { nombres: 'Ana' }).expect(400);
    });
  });

  it('no expone el borrado ni la consulta individual que genero Nest', async () => {
    const { body: user } = await post(validUser).expect(201);

    await admin().delete(`/api/users/${user.id}`).expect(404);
    await admin().get(`/api/users/${user.id}`).expect(404);
  });
});
