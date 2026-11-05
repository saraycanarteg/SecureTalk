// Ensayo de la sustentacion contra los contenedores reales: T01 a T12 del Anexo D.
// Uso, desde la raiz del repositorio y con la pila ya levantada, migrada y con seed:
//   ADMIN_PASSWORD=<SEED_ADMIN_PASSWORD> node docs/evidencias/ensayo-demo.mjs
// Nunca imprime tokens ni contrasenas. Detiene y vuelve a iniciar AUTH y STEGO.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const AUTH = process.env.AUTH_URL ?? 'http://127.0.0.1:3001';
const STEGO = process.env.STEGO_URL ?? 'http://127.0.0.1:3002';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Usuarios nuevos en cada corrida, con una contrasena que no se guarda en ningun lado.
const USER_PASSWORD = `Ensayo-${randomUUID()}-Aa1`;
if (!ADMIN_PASSWORD) {
  console.error('Falta ADMIN_PASSWORD.');
  process.exit(2);
}

let failed = 0;
const title = (text) => console.log(`\n== ${text}`);
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${label}${detail ? ` -> ${detail}` : ''}`);
};

const compose = (...args) => {
  const result = spawnSync('docker', ['compose', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`docker compose ${args[0]} fallo`);
  return result.stdout;
};

async function status(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).status;
  } catch {
    return 'sin conexion';
  }
}

async function waitHealthy(url) {
  for (let i = 0; i < 60; i += 1) {
    if ((await status(url)) === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} no respondio`);
}

async function api(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Algunas respuestas no traen cuerpo JSON.
  }
  return { status: res.status, json };
}

async function analyze(token, path, type = 'image/png') {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(path)], { type }), basename(path));
  const res = await fetch(`${STEGO}/api/steganography/analyze`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const login = (username, password) => api('POST', `${AUTH}/api/auth/login`, null, { username, password });
const uploads = () => compose('exec', '-T', 'stego-service', 'ls', '/app/data/uploads').trim();

const suffix = String(Date.now() % 1000000).padStart(6, '0');
const cedula = (n) => {
  const digits = [1, 7, 0, ...String((Number(suffix) + n * 1000) % 1000000).padStart(6, '0').split('').map(Number)];
  const sum = digits.reduce((total, digit, i) => {
    const value = i % 2 === 0 ? digit * 2 : digit;
    return total + (value > 9 ? value - 9 : value);
  }, 0);
  return digits.join('') + String((10 - (sum % 10)) % 10);
};

title('T01 AUTH y STEGO se inician y detienen por separado');
compose('stop', 'stego-service');
check('STEGO detenido: AUTH sigue respondiendo', (await status(`${AUTH}/health`)) === 200);
check('STEGO detenido: STEGO no responde', (await status(`${STEGO}/health`)) === 'sin conexion');
compose('start', 'stego-service');
await waitHealthy(`${STEGO}/health`);
compose('stop', 'auth-service');
check('AUTH detenido: STEGO sigue respondiendo', (await status(`${STEGO}/health`)) === 200);
check('AUTH detenido: AUTH no responde', (await status(`${AUTH}/health`)) === 'sin conexion');
compose('start', 'auth-service');
await waitHealthy(`${AUTH}/health`);

title('T02 Login con contrasena valida e invalida');
const admin = await login('admin', ADMIN_PASSWORD);
check('contrasena valida entrega un JWT', admin.status === 200 && admin.json?.accessToken?.split('.').length === 3, `HTTP ${admin.status}`);
const adminToken = admin.json.accessToken;
const badLogin = await login(`nadie_${suffix}`, 'incorrecta');
check('contrasena invalida se rechaza', badLogin.status === 401, `HTTP ${badLogin.status}`);

title('T05 Dos roles a un usuario y un rol a dos usuarios');
const roles = (await api('GET', `${AUTH}/api/roles?limit=100`, adminToken)).json.data;
const roleId = (name) => roles.find((role) => role.rol === name).id;
const users = {};
for (const [i, name] of ['ana', 'bruno', 'carla', 'dario'].entries()) {
  const created = await api('POST', `${AUTH}/api/users`, adminToken, {
    cedula: cedula(i + 1),
    nombres: name,
    apellidos: 'Prueba',
    fechaNacimiento: '1999-05-20',
    username: `${name}_${suffix}`,
    email: `${name}_${suffix}@example.com`,
    password: USER_PASSWORD,
  });
  if (created.status !== 201) throw new Error(`no se pudo crear ${name}: HTTP ${created.status}`);
  users[name] = created.json.id;
}
const assign = (user, role) => api('POST', `${AUTH}/api/user-roles`, adminToken, { userId: users[user], roleId: roleId(role) });
check('ana recibe ANALYST', (await assign('ana', 'ANALYST')).status === 201);
check('ana recibe tambien USER (dos roles)', (await assign('ana', 'USER')).status === 201);
const brunoRole = await assign('bruno', 'ANALYST');
check('bruno recibe ANALYST (un rol, dos usuarios)', brunoRole.status === 201);
check('carla recibe USER', (await assign('carla', 'USER')).status === 201);
check('dario recibe ANALYST', (await assign('dario', 'ANALYST')).status === 201);

title('T06 Repetir una asignacion');
const repeated = await assign('ana', 'ANALYST');
check('no se crea una asociacion duplicada', repeated.status === 409, `HTTP ${repeated.status}`);

const token = async (name) => (await login(`${name}_${suffix}`, USER_PASSWORD)).json.accessToken;
const [ana, bruno, carla, dario] = await Promise.all(['ana', 'bruno', 'carla', 'dario'].map(token));

title('T03 STEGO sin JWT o con JWT manipulado');
const noToken = await analyze(null, 'samples/original.png');
check('sin JWT', noToken.status === 401, `HTTP ${noToken.status}`);
const [h, p, s] = carla.split('.');
const claims = JSON.parse(Buffer.from(p, 'base64url'));
const forged = [h, Buffer.from(JSON.stringify({ ...claims, sub: users.ana })).toString('base64url'), s].join('.');
const tampered = await analyze(forged, 'samples/original.png');
check('otro sub con la firma original', tampered.status === 401, `HTTP ${tampered.status}`);
console.log('NOTA  JWT vencido: lo cubre test/stego.e2e-spec.ts, porque aqui no se firma con la llave privada.');

title('T04 Usuario con rol USER intenta analizar');
const asUser = await analyze(carla, 'samples/original.png');
check('denegado', asUser.status === 403, `HTTP ${asUser.status}`);

title('T09 Imagen original y muestra con carga LSB');
const describe = (r) => `HTTP ${r.status} status=${r.json?.status} action=${r.json?.action} technique=${r.json?.technique}`;
const original = await analyze(ana, 'samples/original.png');
check('original.png sin indicios', original.status < 300 && original.json?.status === 'sin_indicios', describe(original));
const stego = await analyze(ana, 'samples/lsb-100.png');
check('lsb-100.png sospechosa', stego.status < 300 && stego.json?.status === 'sospechoso', describe(stego));
console.log(`      indicadores de lsb-100.png: ${JSON.stringify(stego.json?.indicators).slice(0, 300)}`);
console.log(`      limitaciones: ${JSON.stringify(stego.json?.limitations).slice(0, 300)}`);

title('T07 Retirar un rol y reutilizar el mismo JWT');
const before = await analyze(bruno, 'samples/original.png');
check('con ANALYST puede analizar', before.status < 300, `HTTP ${before.status}`);
const removed = await api('DELETE', `${AUTH}/api/user-roles/${brunoRole.json.id}`, adminToken);
check('se retira el rol', removed.status < 300, `HTTP ${removed.status}`);
const after = await analyze(bruno, 'samples/original.png');
check('el mismo JWT queda denegado', after.status === 403, `HTTP ${after.status}`);

title('T10 Archivos invalidos, corruptos o demasiado grandes');
for (const [path, expected, type] of [
  ['samples/invalidos/ejecutable-renombrado.png', 415, 'image/png'],
  ['samples/invalidos/imagen.gif', 415, 'image/gif'],
  ['samples/invalidos/crc-incorrecto.png', 400, 'image/png'],
  ['samples/invalidos/demasiado-grande.png', 413, 'image/png'],
]) {
  const rejected = await analyze(ana, path, type);
  check(basename(path), rejected.status === expected, `HTTP ${rejected.status}, esperado ${expected}`);
}

title('T11 Consultar un analisis ajeno');
const own = await api('GET', `${STEGO}/api/steganography/results/${stego.json.analysis_id}`, ana);
check('la propietaria lo consulta', own.status === 200, `HTTP ${own.status}`);
const foreign = await api('GET', `${STEGO}/api/steganography/results/${stego.json.analysis_id}`, dario);
check('otro ANALYST no accede', foreign.status === 403 || foreign.status === 404, `HTTP ${foreign.status}`);

title('T08 AUTH inaccesible: STEGO no procesa');
const beforeDown = uploads();
compose('stop', 'auth-service');
const down = await analyze(ana, 'samples/original.png');
check('el analisis responde 503', down.status === 503, `HTTP ${down.status}`);
const downResult = await api('GET', `${STEGO}/api/steganography/results/${stego.json.analysis_id}`, ana);
check('la consulta responde 503', downResult.status === 503, `HTTP ${downResult.status}`);
check('no quedo ningun archivo nuevo', uploads() === beforeDown);
compose('start', 'auth-service');
await waitHealthy(`${AUTH}/health`);
const recovered = await analyze(ana, 'samples/original.png');
check('al volver AUTH, STEGO opera de nuevo', recovered.status < 300, `HTTP ${recovered.status}`);

title('T12 Bitacoras sin secretos');
const logs = compose('logs', '--no-color', 'auth-service', 'stego-service');
check('hay eventos de acceso, autorizacion y analisis', /login_exitoso/.test(logs) && /acceso metodo=/.test(logs));
check('sin JWT completos', !/eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(logs));
check('sin la contrasena de ADMIN ni la de usuarios', !logs.includes(ADMIN_PASSWORD) && !logs.includes(USER_PASSWORD));
check('sin nombres de archivo de la prueba', !logs.includes('ejecutable-renombrado'));

console.log(`\nResultado: ${failed === 0 ? 'todas las comprobaciones pasaron' : `${failed} comprobaciones fallaron`}`);
process.exit(failed === 0 ? 0 : 1);
