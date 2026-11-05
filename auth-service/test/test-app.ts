import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { TokenService } from './../src/auth/token.service';
import { Role } from './../src/roles/entities/role.entity';
import { UserRole } from './../src/user-roles/entities/user-role.entity';
import { User } from './../src/users/entities/user.entity';

// Misma configuracion que main.ts, sobre una base de datos recien migrada.
export async function createTestApp(): Promise<{
  app: NestExpressApplication;
  dataSource: DataSource;
}> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.dropDatabase();
  await dataSource.runMigrations();

  return { app, dataSource };
}

let userCounter = 0;

// Inserta directamente en la BD: la cedula generada no pasa por la validacion de la API.
export function createTestUser(
  dataSource: DataSource,
  username: string,
  passwordHash = 'hash-de-prueba',
): Promise<User> {
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
}

export function createTestRole(dataSource: DataSource, rol: string): Promise<Role> {
  const roles = dataSource.getRepository(Role);
  return roles.save(roles.create({ rol }));
}

// Crea un usuario con el rol ADMIN y devuelve su JWT, para probar las rutas administrativas.
// Ocupa una fila en users, roles y user_roles, que las pruebas deben tener en cuenta al contar.
export async function createAdminToken(
  app: NestExpressApplication,
  dataSource: DataSource,
): Promise<string> {
  const admin = await createTestUser(dataSource, 'admin-e2e');
  const role = await createTestRole(dataSource, 'ADMIN');
  await dataSource.getRepository(UserRole).save({ userId: admin.id, roleId: role.id });

  return app.get(TokenService).sign(admin.id);
}
