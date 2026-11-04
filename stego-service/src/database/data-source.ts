import { config } from 'dotenv';
import { DataSource } from 'typeorm';

import { validateEnv } from '../config/env.schema.js';
import { buildDatabaseOptions } from './database.config.js';

config({ quiet: true });

// Usado por el CLI de TypeORM.
export default new DataSource(buildDatabaseOptions(validateEnv(process.env)));
