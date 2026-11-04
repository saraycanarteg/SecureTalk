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
    .default(3001),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000'),

  TRUST_PROXY: z
    .string()
    .optional(),

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
});

export type Env = z.infer<typeof envSchema>;

// Solo lo exige `npm run seed`: el servicio arranca sin estas variables.
export const seedEnvSchema = z.object({
  SEED_ADMIN_USERNAME: z.string().min(1).max(50),
  SEED_ADMIN_EMAIL: z.email().max(150),
  SEED_ADMIN_PASSWORD: z.string().min(12),
  SEED_ADMIN_CEDULA: z.string().regex(/^[0-9]{10}$/),
  SEED_ADMIN_NOMBRES: z.string().min(1).max(100),
  SEED_ADMIN_APELLIDOS: z.string().min(1).max(100),
  SEED_ADMIN_FECHA_NACIMIENTO: z.iso.date(),
});

// Solo reporta nombres de variables, nunca sus valores.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(`Variables de entorno invalidas: ${fields.join(', ')}`);
  }
  return result.data;
}