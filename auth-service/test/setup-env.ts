import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Se asignan siempre, incluso si existe un .env: las pruebas borran la base de datos
// y nunca deben apuntar a otra que no sea el Postgres de docker-compose.test.yml.
const keysDir = mkdtempSync(join(tmpdir(), 'securetalk-e2e-'));
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(join(keysDir, 'private.pem'), privateKey);
writeFileSync(join(keysDir, 'public.pem'), publicKey);

Object.assign(process.env, {
  NODE_ENV: 'test',
  CORS_ORIGINS: 'http://localhost:3000',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5433',
  DB_USERNAME: 'securetalk_test',
  DB_PASSWORD: 'solo_para_pruebas',
  DB_DATABASE: 'securetalk_test',
  DB_SSL: 'false',
  RATE_LIMIT_MAX: '100000',
  JWT_PRIVATE_KEY_PATH: join(keysDir, 'private.pem'),
  JWT_PUBLIC_KEY_PATH: join(keysDir, 'public.pem'),
  JWT_ISSUER: 'securetalk-auth-test',
  JWT_AUDIENCE: 'securetalk-api-test',
  JWT_EXPIRES_IN_SECONDS: '900',
  STEGO_SERVICE_KEY: 'clave-de-servicio-solo-para-pruebas-e2e',
});
