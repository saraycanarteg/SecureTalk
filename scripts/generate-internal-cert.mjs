// Genera el certificado del canal interno STEGO -> AUTH en keys/internal/ (ignorada por git).
// Uso: node scripts/generate-internal-cert.mjs [--force]
// Solo requiere Docker: OpenSSL se ejecuta en un contenedor desechable.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const certDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'keys', 'internal');

if (existsSync(join(certDir, 'auth.key')) && !process.argv.includes('--force')) {
  console.error('Ya existe keys/internal/auth.key. Usa --force para reemplazarla.');
  process.exit(1);
}

mkdirSync(certDir, { recursive: true });

// AUTH corre como el usuario node (1000) y la llave tiene permisos 600: debe poder leerla.
// En Linux y Mac queda a nombre del usuario actual, igual que las llaves JWT.
const owner = process.getuid ? `${process.getuid()}:${process.getgid()}` : '1000:1000';
const setOwner = `chown ${owner} /out/auth.*`;
const commands = [
  'apk add --no-cache --quiet openssl',
  'openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 825' +
    ' -keyout /out/auth.key -out /out/auth.crt -subj /CN=auth-service' +
    ' -addext subjectAltName=DNS:auth-service,DNS:localhost',
  'chmod 600 /out/auth.key',
  'chmod 644 /out/auth.crt',
  setOwner,
];

const result = spawnSync(
  'docker',
  ['run', '--rm', '-v', `${certDir}:/out`, 'alpine:3', 'sh', '-c', commands.join(' && ')],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

if (result.error || result.status !== 0) {
  console.error('No se pudo generar el certificado. Comprueba que Docker este en ejecucion.');
  process.exit(1);
}

console.log('Certificado generado en keys/internal/: auth.key (solo AUTH) y auth.crt (AUTH y STEGO).');
