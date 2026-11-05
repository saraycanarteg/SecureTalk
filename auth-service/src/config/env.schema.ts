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

  JWT_PRIVATE_KEY_PATH: z
    .string()
    .min(1),

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

  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(900)
    .default(900),

  STEGO_SERVICE_KEY: z
    .string()
    .min(32),

  INTERNAL_TLS_CERT_PATH: z
    .string()
    .min(1)
    .optional(),

  INTERNAL_TLS_KEY_PATH: z
    .string()
    .min(1)
    .optional(),

  INTERNAL_TLS_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3443),

  RATE_LIMIT_BLOCK_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
}).refine(
  (env) => Boolean(env.INTERNAL_TLS_CERT_PATH) === Boolean(env.INTERNAL_TLS_KEY_PATH),
  {
    path: ['INTERNAL_TLS_CERT_PATH'],
    message: 'el certificado y su llave se configuran juntos',
  },
);

export type Env = z.infer<typeof envSchema>;

// Solo lo exige `npm run seed`: el servicio arranca sin estas variables.
export const seedEnvSchema = z.object({
  SEED_ADMIN_USERNAME: z.string().min(1).max(50),
  SEED_ADMIN_EMAIL: z.email().max(150),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(128),
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