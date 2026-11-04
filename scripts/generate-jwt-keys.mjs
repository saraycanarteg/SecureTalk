// Genera el par de llaves Ed25519 de los JWT en keys/ (ignorada por git).
// Uso: node scripts/generate-jwt-keys.mjs [--force]
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const keysDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'keys');
const privatePath = join(keysDir, 'jwt_private.pem');
const publicPath = join(keysDir, 'jwt_public.pem');

if (existsSync(privatePath) && !process.argv.includes('--force')) {
  console.error(
    'Ya existe keys/jwt_private.pem. Usa --force para reemplazarla: los tokens vigentes dejaran de ser validos.',
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(keysDir, { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log('Llaves generadas en keys/: jwt_private.pem (solo AUTH) y jwt_public.pem (AUTH y STEGO).');
