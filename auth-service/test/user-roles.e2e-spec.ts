import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';
import { createTestApp } from './test-app';

const UNKNOWN_ID = '6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d';

describe('/api/user-roles (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let userCounter = 0;

  const server = () => request(app.getHttpServer());
  const assign = (userId: string, roleId: string) =>
    server().post('/api/user-roles').send({ userId, roleId });
  const assignments = () => dataSource.getRepository(UserRole);

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
        passwordHash: 'hash-de-prueba',
      }),
    );
  };

  const createRole = (rol: string) => {
    const roles = dataSource.getRepository(Role);
    return roles.save(roles.create({ rol }));
  };

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await dataSource.query(`TRUNCATE "user_roles", "users", "roles" CASCADE`);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST', () => {
    it('crea la asignacion con identificador propio y fecha', async () => {
      const user = await createUser('ana');
      const role = await createRole('ANALYST');

      const res = await assign(user.id, role.id).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        roleId: role.id,
        assignedAt: expect.any(String),
      });
    });

    it('T05: un usuario con dos roles y un rol en dos usuarios', async () => {
      const ana = await createUser('ana');
      const luis = await createUser('luis');
      const admin = await createRole('ADMIN');
      const analyst = await createRole('ANALYST');

      await assign(ana.id, admin.id).expect(201);
      await assign(ana.id, analyst.id).expect(201);
      await assign(luis.id, analyst.id).expect(201);

      await expect(assignments().countBy({ userId: ana.id })).resolves.toBe(2);
      await expect(assignments().countBy({ roleId: analyst.id })).resolves.toBe(2);
      await expect(assignments().count()).resolves.toBe(3);
    });

    it('T06: una asignacion repetida responde 409 sin crear otra fila', async () => {
      const user = await createUser('ana');
      const role = await createRole('ANALYST');
      await assign(user.id, role.id).expect(201);

      const res = await assign(user.id, role.id).expect(409);

      expect(res.body.message).toBe('El usuario ya tiene ese rol');
      await expect(assignments().count()).resolves.toBe(1);
    });

    it('T06: asignaciones simultaneas crean una sola fila', async () => {
      const user = await createUser('ana');
      const role = await createRole('ANALYST');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => assign(user.id, role.id)),
      );
      const statuses = responses.map((res) => res.status);

      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(4);
      await expect(assignments().count()).resolves.toBe(1);
    });

    it('responde 404 si el usuario o el rol no existen', async () => {
      const user = await createUser('ana');
      const role = await createRole('ANALYST');

      const noUser = await assign(UNKNOWN_ID, role.id).expect(404);
      const noRole = await assign(user.id, UNKNOWN_ID).expect(404);

      expect(noUser.body.message).toBe('Usuario no encontrado');
      expect(noRole.body.message).toBe('Rol no encontrado');
      await expect(assignments().count()).resolves.toBe(0);
    });

    it('responde 404 con un usuario con soft delete', async () => {
      const user = await createUser('borrada');
      const role = await createRole('ANALYST');
      await dataSource.getRepository(User).softDelete(user.id);

      await assign(user.id, role.id).expect(404);
    });

    it.each([
      ['identificadores que no son UUID', { userId: '1', roleId: '2' }],
      ['cuerpo vacio', {}],
      ['campo ajeno al contrato', { userId: UNKNOWN_ID, roleId: UNKNOWN_ID, extra: true }],
    ])('responde 400 con %s', async (_motivo, body) => {
      await server().post('/api/user-roles').send(body).expect(400);
    });
  });

  describe('DELETE /:id', () => {
    it('retira el rol sin afectar otras asignaciones', async () => {
      const user = await createUser('ana');
      const admin = await createRole('ADMIN');
      const analyst = await createRole('ANALYST');
      const { body: kept } = await assign(user.id, admin.id).expect(201);
      const { body: removed } = await assign(user.id, analyst.id).expect(201);

      await server().delete(`/api/user-roles/${removed.id}`).expect(204);

      const rows = await assignments().find();
      expect(rows.map((row) => row.id)).toEqual([kept.id]);
    });

    it('permite volver a asignar un rol retirado', async () => {
      const user = await createUser('ana');
      const role = await createRole('ANALYST');
      const { body } = await assign(user.id, role.id).expect(201);

      await server().delete(`/api/user-roles/${body.id}`).expect(204);

      await assign(user.id, role.id).expect(201);
    });

    it('responde 404 si no existe y 400 si el identificador no es UUID', async () => {
      await server().delete(`/api/user-roles/${UNKNOWN_ID}`).expect(404);
      await server().delete('/api/user-roles/123').expect(400);
    });
  });

  it('no expone las rutas que genero Nest', async () => {
    const user = await createUser('ana');
    const role = await createRole('ANALYST');
    const { body } = await assign(user.id, role.id).expect(201);

    await server().get('/api/user-roles').expect(404);
    await server().get(`/api/user-roles/${body.id}`).expect(404);
    await server().patch(`/api/user-roles/${body.id}`).send({}).expect(404);
  });
});
