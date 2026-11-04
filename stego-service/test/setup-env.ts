import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Se asignan siempre, incluso si existe un .env: las pruebas borran la base de datos
// y nunca deben apuntar a otra que no sea el stego-db-test de docker-compose.test.yml.
const workDir = mkdtempSync(join(tmpdir(), 'securetalk-stego-e2e-'));
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(join(workDir, 'private.pem'), privateKey);
writeFileSync(join(workDir, 'public.pem'), publicKey);

Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5434',
  DB_USERNAME: 'securetalk_stego_test',
  DB_PASSWORD: 'solo_para_pruebas',
  DB_DATABASE: 'securetalk_stego_test',
  DB_SSL: 'false',
  RATE_LIMIT_MAX: '100000',
  JWT_PUBLIC_KEY_PATH: join(workDir, 'public.pem'),
  JWT_ISSUER: 'securetalk-auth-test',
  JWT_AUDIENCE: 'securetalk-api-test',
  AUTH_BASE_URL: 'http://127.0.0.1:45871',
  STEGO_SERVICE_KEY: 'clave-de-servicio-solo-para-pruebas-e2e',
  AUTH_TIMEOUT_MS: '300',
  AUTHZ_MODE: 'real',
  UPLOAD_DIR: join(workDir, 'uploads'),
  TEST_JWT_PRIVATE_KEY_PATH: join(workDir, 'private.pem'),
});
