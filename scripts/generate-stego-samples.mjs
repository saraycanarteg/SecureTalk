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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const framed = Buffer.alloc(body.length + 8);
  framed.writeUInt32BE(data.length, 0);
  body.copy(framed, 4);
  framed.writeUInt32BE(crc32(body), body.length + 4);
  return framed;
}

function pngHeader(width, height, { bitDepth = 8, colorType = 2, interlace = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[12] = interlace;
  return pngChunk('IHDR', header);
}

function buildPng(width, height, scanlines, options = {}) {
  return Buffer.concat([
    PNG_SIGNATURE,
    pngHeader(width, height, options),
    ...(options.extraChunks ?? []),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function encodePng(pixels) {
  const stride = WIDTH * CHANNELS;
  const scanlines = Buffer.alloc(HEIGHT * (stride + 1));
  for (let row = 0; row < HEIGHT; row++) {
    pixels.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  return buildPng(WIDTH, HEIGHT, scanlines);
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

function buildBmp(width, height, stored) {
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'latin1');
  header.writeUInt32LE(header.length + stored.length, 2);
  header.writeUInt32LE(header.length, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(stored.length, 34);
  return Buffer.concat([header, stored]);
}

// WIDTH * CHANNELS es multiplo de 4, asi que las filas no necesitan relleno.
const encodeBmp = (stored) => buildBmp(WIDTH, HEIGHT, stored);

function write(name, content) {
  const path = join(samplesDir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`${name.padEnd(40)} ${content.length} bytes`);
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

write('original.png', encodePng(original));
write('original.bmp', encodeBmp(originalBmp));
write('lsb-100.png', encodePng(stegoFull));
write('lsb-100.bmp', encodeBmp(embedSequential(originalBmp, fullMessage)));
write('lsb-25.png', encodePng(embedSequential(original, fullMessage.subarray(0, capacity / 4))));
write('lsb-texto-plano-25.png', encodePng(embedSequential(original, plainMessage(capacity / 4))));
write('lsb-disperso-10.png', encodePng(embedScattered(original, fullMessage.subarray(0, Math.floor(capacity / 10)), 7)));
write('lsb-2.png', encodePng(embedSequential(original, fullMessage.subarray(0, Math.floor(capacity / 50)))));
write('lsb-disperso-3.png', encodePng(embedScattered(original, fullMessage.subarray(0, Math.floor((capacity * 3) / 100)), 11)));

// Filas sin filtrar de un patron RGB sencillo.
function patternScanlines(width, height) {
  const stride = width * CHANNELS;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < stride; col++) {
      scanlines[row * (stride + 1) + 1 + col] = (row * 7 + col * 3) & 0xff;
    }
  }
  return scanlines;
}

function solidScanlines(width, height, value) {
  const stride = width * CHANNELS;
  const scanlines = Buffer.alloc(height * (stride + 1), value);
  for (let row = 0; row < height; row++) {
    scanlines[row * (stride + 1)] = 0;
  }
  return scanlines;
}

// Cada columna repite un valor: todos los valores aparecen el mismo numero de veces.
function gradientScanlines(size) {
  const stride = size * CHANNELS;
  const scanlines = Buffer.alloc(size * (stride + 1));
  for (let row = 0; row < size; row++) {
    const start = row * (stride + 1) + 1;
    for (let col = 0; col < size; col++) {
      scanlines.fill(col, start + col * CHANNELS, start + (col + 1) * CHANNELS);
    }
  }
  return scanlines;
}

const tinyPng = buildPng(16, 16, patternScanlines(16, 16));
const tinyBmp = buildBmp(16, 16, Buffer.alloc(16 * 16 * CHANNELS, 0x55));
const garbledCrc = Buffer.from(tinyPng);
garbledCrc[garbledCrc.length - 20] ^= 0xff;
const wrongFilter = patternScanlines(16, 16);
wrongFilter[0] = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Archivos que el servicio debe rechazar.
write('invalidos/html-renombrado.png', Buffer.from('<html><script>alert(1)</script></html>'));
write('invalidos/ejecutable-renombrado.png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62)]));
write('invalidos/archivo.exe', tinyPng);
write('invalidos/doble-extension.png.exe', tinyPng);
write('invalidos/imagen.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
write('invalidos/imagen.gif', Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]));
write('invalidos/bmp-renombrado.png', tinyBmp);
write('invalidos/png-renombrado.bmp', tinyPng);
write('invalidos/vacio.png', Buffer.alloc(0));
write('invalidos/truncado.png', tinyPng.subarray(0, tinyPng.length - 20));
write('invalidos/truncado.bmp', tinyBmp.subarray(0, tinyBmp.length - 10));
write('invalidos/crc-incorrecto.png', garbledCrc);
write('invalidos/poliglota-zip.png', Buffer.concat([tinyPng, Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26)]));
write('invalidos/poliglota-html.bmp', Buffer.concat([tinyBmp, Buffer.from('<script>alert(1)</script>')]));
write('invalidos/filtro-invalido.png', buildPng(16, 16, wrongFilter));
write('invalidos/zlib-danado.png', Buffer.concat([PNG_SIGNATURE, pngHeader(16, 16), pngChunk('IDAT', Buffer.from('no-es-zlib')), pngChunk('IEND')]));
write('invalidos/dimensiones-falsas.png', buildPng(1000, 1000, patternScanlines(16, 16)));
write('invalidos/bomba-dimensiones.png', Buffer.concat([PNG_SIGNATURE, pngHeader(30000, 30000), pngChunk('IDAT', deflateSync(Buffer.alloc(16))), pngChunk('IEND')]));
write('invalidos/bomba-descompresion.png', buildPng(1, 1, Buffer.alloc(64 * 1024 * 1024)));
write('invalidos/demasiado-grande.png', Buffer.alloc(MAX_FILE_SIZE + 1));

// Archivos validos que la tecnica no puede analizar o que muestran sus limites.
write('limites/paleta.png', buildPng(2, 2, Buffer.alloc(6), { colorType: 3, extraChunks: [pngChunk('PLTE', Buffer.alloc(6, 0x40))] }));
write('limites/entrelazado.png', buildPng(2, 2, Buffer.alloc(15), { interlace: 1 }));
write('limites/16-bits.png', buildPng(2, 2, Buffer.alloc(26), { bitDepth: 16 }));
write('limites/pequena.png', buildPng(32, 32, patternScanlines(32, 32)));
write('limites/un-color.png', buildPng(100, 100, solidScanlines(100, 100, 120)));
write('limites/degradado.png', buildPng(256, 256, gradientScanlines(256)));
write('limites/maximo-16mp.png', buildPng(4000, 4000, Buffer.alloc(4000 * (4000 * 4 + 1)), { colorType: 6 }));
const paddingLength = MAX_FILE_SIZE - tinyPng.length - 12;
write('limites/exactamente-10mb.png', Buffer.concat([tinyPng.subarray(0, tinyPng.length - 12), pngChunk('tEXt', Buffer.alloc(paddingLength, 0x20)), tinyPng.subarray(tinyPng.length - 12)]));
