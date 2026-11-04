import type { DataSourceOptions } from 'typeorm';

import type { Env } from '../config/env.schema.js';
import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { User } from '../users/entities/user.entity.js';
import { InitialSchema1793664000000 } from './migrations/1793664000000-InitialSchema.js';

export type DatabaseEnv = Pick<
  Env,
  'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_DATABASE' | 'DB_SSL'
>;

// El esquema solo cambia mediante migraciones: synchronize queda siempre apagado.
// Cada migracion nueva debe registrarse en este arreglo.
export function buildDatabaseOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: env.DB_SSL === 'true',
    entities: [User, Role, UserRole],
    migrations: [InitialSchema1793664000000],
    synchronize: false,
    migrationsRun: false,
  };
}
