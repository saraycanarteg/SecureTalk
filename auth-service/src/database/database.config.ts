import type { DataSourceOptions } from 'typeorm';

import { LoginAttempt } from '../auth/entities/login-attempt.entity.js';
import { RevokedToken } from '../auth/entities/revoked-token.entity.js';
import type { Env } from '../config/env.schema.js';
import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { User } from '../users/entities/user.entity.js';
import { InitialSchema1793664000000 } from './migrations/1793664000000-InitialSchema.js';
import { LoginAttempts1793750400000 } from './migrations/1793750400000-LoginAttempts.js';
import { RevokedTokens1793836800000 } from './migrations/1793836800000-RevokedTokens.js';

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
    entities: [User, Role, UserRole, LoginAttempt, RevokedToken],
    migrations: [InitialSchema1793664000000, LoginAttempts1793750400000, RevokedTokens1793836800000],
    synchronize: false,
    migrationsRun: false,
  };
}
