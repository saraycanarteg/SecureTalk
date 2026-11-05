// Genera en samples/ imagenes originales y copias con un mensaje oculto por LSB.
// El resultado es reproducible: la misma ejecucion produce siempre los mismos bytes.
// Uso: node scripts/generate-stego-samples.mjs
import { createCipheriv, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples');

const WIDTH = 512;
const HEIGHT = 384;
const CHANNELS = 3;
const TEXT = 'Mensaje de prueba oculto por SecureTalk. ';

// Generador pseudoaleatorio con semilla (mulberry32): hace reproducibles las muestras.
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido suave: una rejilla aleatoria interpolada, para imitar la textura de una fotografia.
function createValueNoise(random, size) {
  const grid = Array.from({ length: (size + 2) ** 2 }, () => random());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x * size;
    const gy = y * size;
    const [ix, iy] = [Math.floor(gx), Math.floor(gy)];
    const [fx, fy] = [smooth(gx - ix), smooth(gy - iy)];
    const at = (col, row) => grid[row * (size + 2) + col];
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

// Escena sintetica: cielo, montanas y suelo con textura y un poco de ruido de sensor.
// Pixeles RGB en orden de lectura, de arriba hacia abajo.
function renderScene(seed) {
  const random = createRandom(seed);
  const octaves = [4, 8, 16, 32, 64, 128].map((size) => createValueNoise(random, size));
  const fractal = (x, y) =>
    octaves.reduce((sum, noise, i) => sum + noise(x, y) / 2 ** (i + 1), 0);
  const skyline = createValueNoise(random, 12);
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));

  const pixels = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  let i = 0;
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const x = col / WIDTH;
      const y = row / HEIGHT;
      const texture = fractal(x, y) - 0.5;
      const ridge = 0.35 + 0.3 * skyline(x, 0.5);
      let color;
      if (y < ridge) {
        const light = 1 - y / ridge;
        color = [90 + 70 * light + 60 * texture, 130 + 60 * light + 60 * texture, 200 + 40 * light + 40 * texture];
      } else if (y < ridge + 0.18) {
        color = [85 + 110 * texture, 80 + 100 * texture, 95 + 90 * texture];
      } else {
        color = [70 + 130 * texture + 40 * y, 105 + 140 * texture, 50 + 90 * texture];
      }
      for (const value of color) {
        pixels[i++] = clamp(value + (random() - 0.5) * 3);
      }
    }
  }
  return pixels;
}

function plainMessage(length) {
  return Buffer.from(TEXT.repeat(Math.ceil(length / TEXT.length))).subarray(0, length);
}

// Cifrar el mensaje hace que sus bits parezcan aleatorios, como en una herramienta real.
// La clave es publica porque solo sirve para reproducir las muestras.
function encryptMessage(length) {
  const key = createHash('sha256').update('securetalk-muestras').digest();
  return createCipheriv('aes-256-ctr', key, Buffer.alloc(16)).update(plainMessage(length));
}

const bitAt = (message, index) => (message[index >> 3] >> (7 - (index & 7))) & 1;

// Inserta el mensaje en orden, byte a byte, a partir del primer byte de color.
function embedSequential(pixels, message) {
  const stego = Buffer.from(pixels);
  for (let i = 0; i < message.length * 8; i++) {
    stego[i] = (stego[i] & 0xfe) | bitAt(message, i);
  }
  return stego;
}

// Inserta el mensaje en posiciones elegidas al azar, sin repetir ninguna.
function embedScattered(pixels, message, seed) {
  const stego = Buffer.from(pixels);
  const random = createRandom(seed);
  const positions = Uint32Array.from(pixels.keys());
  for (let i = 0; i < message.length * 8; i++) {
    const j = i + Math.floor(random() * (positions.length - i));
    [positions[i], positions[j]] = [positions[j], positions[i]];
    stego[positions[i]] = (stego[positions[i]] & 0xfe) | bitAt(message, i);
  }
  return stego;
}

function extractSequential(stego, byteLength) {
  const message = Buffer.alloc(byteLength);
  for (let i = 0; i < byteLength * 8; i++) {
    message[i >> 3] |= (stego[i] & 1) << (7 - (i & 7));
  }
  return message;
}

function encodePng(pixels) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const framed = Buffer.alloc(body.length + 8);
    framed.writeUInt32BE(data.length, 0);
    body.copy(framed, 4);
    framed.writeUInt32BE(crc32(body), body.length + 4);
    return framed;
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;

  const stride = WIDTH * CHANNELS;
  const scanlines = Buffer.alloc(HEIGHT * (stride + 1));
  for (let row = 0; row < HEIGHT; row++) {
    pixels.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Un BMP guarda las filas de abajo hacia arriba y cada pixel en orden BGR.
function toBmpStorageOrder(pixels) {
  const stride = WIDTH * CHANNELS;
  const stored = Buffer.alloc(pixels.length);
  for (let row = 0; row < HEIGHT; row++) {
    const source = (HEIGHT - 1 - row) * stride;
    for (let col = 0; col < WIDTH; col++) {
      for (let c = 0; c < CHANNELS; c++) {
        stored[row * stride + col * CHANNELS + c] = pixels[source + col * CHANNELS + (CHANNELS - 1 - c)];
      }
    }
  }
  return stored;
}

// WIDTH * CHANNELS es multiplo de 4, asi que las filas no necesitan relleno.
function encodeBmp(stored) {
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'latin1');
  header.writeUInt32LE(header.length + stored.length, 2);
  header.writeUInt32LE(header.length, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(WIDTH, 18);
  header.writeInt32LE(HEIGHT, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(stored.length, 34);
  return Buffer.concat([header, stored]);
}

function write(name, content) {
  writeFileSync(join(samplesDir, name), content);
  console.log(`${name.padEnd(30)} ${content.length} bytes`);
}

const capacity = (WIDTH * HEIGHT * CHANNELS) / 8;
const original = renderScene(20261104);
const originalBmp = toBmpStorageOrder(original);
const fullMessage = encryptMessage(capacity);

// Comprueba que el mensaje se puede recuperar: las muestras ocultan datos de verdad.
const stegoFull = embedSequential(original, fullMessage);
if (!extractSequential(stegoFull, capacity).equals(fullMessage)) {
  throw new Error('El mensaje insertado no se pudo recuperar');
}

mkdirSync(samplesDir, { recursive: true });
write('original.png', encodePng(original));
write('original.bmp', encodeBmp(originalBmp));
write('lsb-100.png', encodePng(stegoFull));
write('lsb-100.bmp', encodeBmp(embedSequential(originalBmp, fullMessage)));
write('lsb-25.png', encodePng(embedSequential(original, fullMessage.subarray(0, capacity / 4))));
write('lsb-texto-plano-25.png', encodePng(embedSequential(original, plainMessage(capacity / 4))));
write('lsb-disperso-10.png', encodePng(embedScattered(original, fullMessage.subarray(0, Math.floor(capacity / 10)), 7)));
