import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from './../src/roles/entities/role.entity';
import { createTestApp } from './test-app';

describe('/api/roles (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  const server = () => request(app.getHttpServer());
  const post = (body: object) => server().post('/api/roles').send(body);
  const patch = (id: string, body: object) => server().patch(`/api/roles/${id}`).send(body);

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await dataSource.query(`TRUNCATE "roles" CASCADE`);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST', () => {
    it('crea un rol activo', async () => {
      const res = await post({ rol: 'AUDITOR', description: 'Revisa registros' }).expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        rol: 'AUDITOR',
        description: 'Revisa registros',
        estado: true,
      });
    });

    it('la descripcion es opcional', async () => {
      const res = await post({ rol: 'AUDITOR' }).expect(201);

      expect(res.body.description).toBeNull();
    });

    it('guarda el nombre en mayusculas', async () => {
      const res = await post({ rol: ' auditor ' }).expect(201);

      expect(res.body.rol).toBe('AUDITOR');
    });

    it.each([
      ['sin nombre', {}],
      ['nombre de un caracter', { rol: 'A' }],
      ['nombre con espacios internos', { rol: 'MI ROL' }],
      ['nombre que empieza con digito', { rol: '1ROL' }],
      ['nombre de mas de 50 caracteres', { rol: 'A'.repeat(51) }],
      ['descripcion de mas de 255 caracteres', { rol: 'AUDITOR', description: 'x'.repeat(256) }],
      ['campo ajeno al contrato', { rol: 'AUDITOR', permisos: ['todo'] }],
    ])('responde 400 con %s', async (_motivo, body) => {
      await post(body).expect(400);

      await expect(dataSource.getRepository(Role).count()).resolves.toBe(0);
    });

    it('responde 409 si el rol ya existe, sin distinguir mayusculas', async () => {
      await post({ rol: 'AUDITOR' }).expect(201);

      const res = await post({ rol: 'auditor' }).expect(409);

      expect(res.body.message).toBe('El rol ya existe');
      await expect(dataSource.getRepository(Role).count()).resolves.toBe(1);
    });
  });

  describe('GET', () => {
    it('pagina el listado', async () => {
      await post({ rol: 'AUDITOR' }).expect(201);
      await post({ rol: 'SOPORTE' }).expect(201);

      const first = await server().get('/api/roles?page=1&limit=1').expect(200);
      const second = await server().get('/api/roles?page=2&limit=1').expect(200);

      expect(first.body).toMatchObject({ page: 1, limit: 1, total: 2 });
      expect(first.body.data[0].rol).toBe('AUDITOR');
      expect(second.body.data[0].rol).toBe('SOPORTE');
    });

    it('responde 400 con una paginacion invalida', async () => {
      await server().get('/api/roles?limit=101').expect(400);
    });
  });

  describe('PATCH /:id', () => {
    it('actualiza los campos enviados', async () => {
      const { body: role } = await post({ rol: 'AUDITOR', description: 'Antes' }).expect(201);

      const res = await patch(role.id, { description: 'Despues' }).expect(200);

      expect(res.body).toMatchObject({ rol: 'AUDITOR', description: 'Despues' });
    });

    it('permite quitar la descripcion con null', async () => {
      const { body: role } = await post({ rol: 'AUDITOR', description: 'Antes' }).expect(201);

      const res = await patch(role.id, { description: null }).expect(200);

      expect(res.body.description).toBeNull();
    });

    it('desactiva sin borrar', async () => {
      const { body: role } = await post({ rol: 'AUDITOR' }).expect(201);

      const res = await patch(role.id, { estado: false }).expect(200);

      expect(res.body.estado).toBe(false);
      await expect(dataSource.getRepository(Role).countBy({ id: role.id })).resolves.toBe(1);
    });

    it('responde 400 con null en vez de fallar en la base de datos', async () => {
      const { body: role } = await post({ rol: 'AUDITOR' }).expect(201);

      await patch(role.id, { rol: null }).expect(400);
      await patch(role.id, { estado: null }).expect(400);
    });

    it('responde 409 si el nombre ya pertenece a otro rol', async () => {
      const { body: role } = await post({ rol: 'AUDITOR' }).expect(201);
      await post({ rol: 'SOPORTE' }).expect(201);

      await patch(role.id, { rol: 'SOPORTE' }).expect(409);
    });

    it('responde 404 si no existe y 400 si el identificador no es UUID', async () => {
      await patch('6f0f6a34-5d10-4a51-9d61-0a6a4f1c2b3d', { description: 'x' }).expect(404);
      await patch('123', { description: 'x' }).expect(400);
    });
  });

  it('no expone el borrado ni la consulta individual que genero Nest', async () => {
    const { body: role } = await post({ rol: 'AUDITOR' }).expect(201);

    await server().delete(`/api/roles/${role.id}`).expect(404);
    await server().get(`/api/roles/${role.id}`).expect(404);
  });
});
