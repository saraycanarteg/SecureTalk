import type { AnalyzableImage } from '../image/decoded-image.js';

// Las estadisticas no alcanzan a ver un mensaje de pocos bytes, pero muchas herramientas lo
// escriben sin cifrar al inicio de la imagen. Una imagen natural llego a 11 caracteres seguidos
// en las mediciones, asi que el umbral lo supera con margen.
export const PLAINTEXT_RUN_THRESHOLD = 16;

// Los LSB repetitivos de una zona lisa pueden parecer texto, pero con muy pocos simbolos.
const MIN_DISTINCT_SYMBOLS = 6;

// Admite una cabecera antes del mensaje, como su longitud o el nombre del archivo.
const BYTES_TO_SCAN = 128;
const BITS_TO_SCAN = BYTES_TO_SCAN * 8;

const isPrintable = (byte: number) =>
  (byte >= 0x20 && byte <= 0x7e) ||
  byte === 0x09 ||
  byte === 0x0a ||
  byte === 0x0d;

// Letras del espanol en UTF-8. Aceptar cualquier secuencia de dos bytes daba falsos positivos:
// los LSB de una zona lisa forman esos patrones con facilidad.
const SPANISH_UTF8_PAIRS = new Set(
  [...'áéíóúüñÁÉÍÓÚÜÑ¿¡'].map((letter) => {
    const [first, second] = Buffer.from(letter, 'utf8');
    return (first << 8) | second;
  }),
);

const isSpanishPair = (first: number, second: number | undefined) =>
  second !== undefined && SPANISH_UTF8_PAIRS.has((first << 8) | second);

const isWordCharacter = (byte: number) =>
  (byte >= 0x30 && byte <= 0x39) ||
  (byte >= 0x41 && byte <= 0x5a) ||
  (byte >= 0x61 && byte <= 0x7a) ||
  byte === 0x20;

// Un mensaje es sobre todo letras, digitos y espacios; una secuencia al azar tiene muchos simbolos.
const MIN_WORD_CHARACTER_RATIO = 0.7;

export function longestReadableRun(bytes: Uint8Array): number {
  const symbols = new Set<number>();
  let best = 0;
  let run = 0;
  let wordCharacters = 0;
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i];
    const pair = isSpanishPair(byte, bytes[i + 1]);
    if (!pair && !isPrintable(byte)) {
      run = 0;
      wordCharacters = 0;
      symbols.clear();
      i++;
      continue;
    }
    run++;
    wordCharacters += pair || isWordCharacter(byte) ? 1 : 0;
    symbols.add(byte);
    i += pair ? 2 : 1;
    if (
      symbols.size >= MIN_DISTINCT_SYMBOLS &&
      wordCharacters / run >= MIN_WORD_CHARACTER_RATIO &&
      run > best
    ) {
      best = run;
    }
  }
  return best;
}

function packBits(bits: number[], mostSignificantFirst: boolean): Uint8Array {
  const bytes = new Uint8Array(bits.length >> 3);
  for (let i = 0; i < bytes.length * 8; i++) {
    const shift = mostSignificantFirst ? 7 - (i & 7) : i & 7;
    bytes[i >> 3] |= bits[i] << shift;
  }
  return bytes;
}

// LSB de los canales indicados, leyendo los pixeles en el orden en que se ven.
function visibleOrderBits(image: AnalyzableImage, offsets: number[]): number[] {
  const { samples, bytesPerPixel, width, height, bottomUp } = image;
  const pixelCount = width * height;
  const bits: number[] = [];

  for (let i = 0; i < pixelCount && bits.length < BITS_TO_SCAN; i++) {
    const row = Math.floor(i / width);
    const storedRow = bottomUp ? height - 1 - row : row;
    const pixel = (storedRow * width + (i % width)) * bytesPerPixel;
    for (const offset of offsets) {
      bits.push(samples[pixel + offset] & 1);
    }
  }
  return bits;
}

// LSB de los canales de color en el orden del archivo. El alfa queda fuera: si es constante,
// fija un bit de cada byte y hace que datos sin mensaje parezcan texto ASCII.
function storedOrderBits(image: AnalyzableImage): number[] {
  const { samples, bytesPerPixel, width, height, channels } = image;
  const offsets = channels
    .map((channel) => channel.offset)
    .sort((a, b) => a - b);
  const pixelCount = width * height;
  const bits: number[] = [];

  for (let i = 0; i < pixelCount && bits.length < BITS_TO_SCAN; i++) {
    for (const offset of offsets) {
      bits.push(samples[i * bytesPerPixel + offset] & 1);
    }
  }
  return bits;
}

// Solo devuelve una cuenta: el texto encontrado nunca sale de esta funcion.
export function findPlaintextRun(image: AnalyzableImage): number {
  const offsets = image.channels.map((channel) => channel.offset);
  const sequences = [
    visibleOrderBits(image, offsets),
    storedOrderBits(image),
    ...offsets.map((offset) => visibleOrderBits(image, [offset])),
  ];

  let best = 0;
  for (const bits of sequences) {
    for (const mostSignificantFirst of [true, false]) {
      best = Math.max(
        best,
        longestReadableRun(packBits(bits, mostSignificantFirst)),
      );
    }
  }
  return best;
}
