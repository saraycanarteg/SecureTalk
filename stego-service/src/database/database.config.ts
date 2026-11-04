import type { DataSourceOptions } from 'typeorm';

import type { Env } from '../config/env.schema.js';
import { Analysis } from '../steganography/entities/analysis.entity.js';
import { InitialSchema1793836800000 } from './migrations/1793836800000-InitialSchema.js';

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
    entities: [Analysis],
    migrations: [InitialSchema1793836800000],
    synchronize: false,
    migrationsRun: false,
  };
}
