import { AnalyzableImage } from '../image/decoded-image';
import {
  findPlaintextRun,
  longestReadableRun,
  PLAINTEXT_RUN_THRESHOLD,
} from './lsb-plaintext';

const WIDTH = 64;
const HEIGHT = 64;
const TEXT = 'Mensaje secreto de la sala 12';

const toBits = (message: Buffer, mostSignificantFirst = true) => {
  const bits: number[] = [];
  for (const byte of message) {
    for (let i = 0; i < 8; i++) {
      bits.push((byte >> (mostSignificantFirst ? 7 - i : i)) & 1);
    }
  }
  return bits;
};

// Imagen con LSB en 0, con los bits del mensaje en las posiciones que indica `positionOf`.
const imageWith = (
  bits: number[],
  positionOf: (bit: number) => number,
  options: Partial<AnalyzableImage> = {},
): AnalyzableImage => {
  const bytesPerPixel = options.bytesPerPixel ?? 3;
  const samples = Buffer.alloc(WIDTH * HEIGHT * bytesPerPixel, 0x40);
  bits.forEach((bit, i) => {
    samples[positionOf(i)] |= bit;
  });
  return {
    format: 'png',
    width: WIDTH,
    height: HEIGHT,
    analyzable: true,
    samples,
    bytesPerPixel,
    bottomUp: false,
    channels: [
      { name: 'r', offset: 0 },
      { name: 'g', offset: 1 },
      { name: 'b', offset: 2 },
    ],
    ...options,
  };
};

describe('longestReadableRun', () => {
  it('cuenta los caracteres legibles seguidos', () => {
    expect(longestReadableRun(Buffer.from('Hola mundo'))).toBe(10);
  });

  it('corta la racha en un byte que no es texto', () => {
    const bytes = Buffer.concat([
      Buffer.from('abcdefg'),
      Buffer.from([0x00]),
      Buffer.from('hijklm'),
    ]);

    expect(longestReadableRun(bytes)).toBe(7);
  });

  it('cuenta una letra con tilde como un solo caracter', () => {
    expect(longestReadableRun(Buffer.from('reunión ñandú'))).toBe(13);
  });

  it('ignora una racha con muy pocos simbolos distintos', () => {
    expect(longestReadableRun(Buffer.from('UUUUUUUUUUUUUUUUUUUU'))).toBe(0);
    expect(longestReadableRun(Buffer.from('ababababababababab'))).toBe(0);
  });

  it('no acepta un byte de continuacion suelto', () => {
    expect(longestReadableRun(Buffer.from([0x80, 0x81, 0xc3]))).toBe(0);
  });

  it('no acepta secuencias UTF-8 que no son letras del espanol', () => {
    // Los LSB de una zona lisa pueden formar estos pares: fue un falso positivo real.
    const bytes = Buffer.from('c280c390d09fdfbfc481c5a1c6a7c7b3', 'hex');

    expect(longestReadableRun(bytes)).toBe(0);
  });

  it('ignora una racha con demasiados simbolos, como la que aparece al azar', () => {
    expect(longestReadableRun(Buffer.from(">!'?%#&*)(+,;:<="))).toBe(0);
  });
});

describe('findPlaintextRun', () => {
  it('encuentra texto insertado en orden en los canales de color', () => {
    const image = imageWith(toBits(Buffer.from(TEXT)), (bit) => bit);

    expect(findPlaintextRun(image)).toBe(TEXT.length);
  });

  it('encuentra texto con el bit menos significativo primero', () => {
    const image = imageWith(toBits(Buffer.from(TEXT), false), (bit) => bit);

    expect(findPlaintextRun(image)).toBe(TEXT.length);
  });

  it('encuentra texto despues de una cabecera binaria', () => {
    const message = Buffer.concat([
      Buffer.from([0, 0, 0, 29]),
      Buffer.from(TEXT),
    ]);

    expect(findPlaintextRun(imageWith(toBits(message), (bit) => bit))).toBe(
      TEXT.length,
    );
  });

  it('encuentra texto en un solo canal', () => {
    const blueOffset = 2;
    const image = imageWith(
      toBits(Buffer.from(TEXT)),
      (bit) => bit * 3 + blueOffset,
    );

    expect(findPlaintextRun(image)).toBe(TEXT.length);
  });

  it('en un BMP encuentra texto en la primera fila visible, en orden RGB', () => {
    const channels = [
      { name: 'r' as const, offset: 2 },
      { name: 'g' as const, offset: 1 },
      { name: 'b' as const, offset: 0 },
    ];
    const image = imageWith(
      toBits(Buffer.from(TEXT)),
      (bit) => {
        const pixel = Math.floor(bit / 3);
        const storedRow = HEIGHT - 1 - Math.floor(pixel / WIDTH);
        return (
          storedRow * WIDTH * 3 + (pixel % WIDTH) * 3 + channels[bit % 3].offset
        );
      },
      { format: 'bmp', bottomUp: true, channels },
    );

    expect(findPlaintextRun(image)).toBe(TEXT.length);
  });

  it('en un BMP encuentra texto en el orden de los bytes del archivo', () => {
    const channels = [
      { name: 'r' as const, offset: 2 },
      { name: 'g' as const, offset: 1 },
      { name: 'b' as const, offset: 0 },
    ];
    const image = imageWith(toBits(Buffer.from(TEXT)), (bit) => bit, {
      format: 'bmp',
      bottomUp: true,
      channels,
    });

    expect(findPlaintextRun(image)).toBe(TEXT.length);
  });

  it('no confunde un canal alfa constante con texto', () => {
    // Con el alfa en la lectura, un bit fijo deja cada byte en el rango ASCII: fue un falso positivo.
    const image = imageWith([], (bit) => bit, { bytesPerPixel: 4 });
    for (let i = 0; i < image.samples.length; i++) {
      const isAlpha = i % 4 === 3;
      image.samples[i] = isAlpha ? 0xfe : (i * 2654435761) >>> 24;
    }

    expect(findPlaintextRun(image)).toBeLessThan(PLAINTEXT_RUN_THRESHOLD);
  });

  it('una imagen sin mensaje no alcanza el umbral', () => {
    expect(findPlaintextRun(imageWith([], (bit) => bit))).toBeLessThan(
      PLAINTEXT_RUN_THRESHOLD,
    );
  });
});
