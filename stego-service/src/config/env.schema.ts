import { resolve } from 'node:path';

import { z } from 'zod';

export const envSchema = z.object({

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3002),

  DB_HOST: z
    .string()
    .min(1),

  DB_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5432),

  DB_USERNAME: z
    .string()
    .min(1),

  DB_PASSWORD: z
    .string()
    .min(12),

  DB_DATABASE: z
    .string()
    .min(1),

  DB_SSL: z
    .enum(['true', 'false'])
    .default('false'),

  RATE_LIMIT_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),

  RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(100),

  RATE_LIMIT_BLOCK_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),

  JWT_PUBLIC_KEY_PATH: z
    .string()
    .min(1),

  JWT_ISSUER: z
    .string()
    .min(1)
    .default('securetalk-auth'),

  JWT_AUDIENCE: z
    .string()
    .min(1)
    .default('securetalk-api'),

  AUTH_BASE_URL: z
    .url(),

  STEGO_SERVICE_KEY: z
    .string()
    .min(32),

  AUTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

  AUTHZ_MODE: z
    .enum(['real', 'mock'])
    .default('real'),

  UPLOAD_DIR: z
    .string()
    .min(1),

  QUARANTINE_DIR: z
    .string()
    .min(1),
}).refine(
  (env) => !(env.NODE_ENV === 'production' && env.AUTHZ_MODE === 'mock'),
  {
    path: ['AUTHZ_MODE'],
    message: 'mock no esta permitido con NODE_ENV=production',
  },
).refine(
  (env) => env.NODE_ENV !== 'production' || env.AUTH_BASE_URL.startsWith('https://'),
  {
    path: ['AUTH_BASE_URL'],
    message: 'debe usar https con NODE_ENV=production',
  },
).refine(
  (env) => resolve(env.UPLOAD_DIR) !== resolve(env.QUARANTINE_DIR),
  {
    path: ['QUARANTINE_DIR'],
    message: 'debe ser una carpeta distinta de UPLOAD_DIR',
  },
);

export type Env = z.infer<typeof envSchema>;

// Los mensajes de zod describen la regla incumplida, nunca el valor recibido.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const fields = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Variables de entorno invalidas: ${fields.join('; ')}`);
  }
  return result.data;
}
