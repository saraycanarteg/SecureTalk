import { deflateSync } from 'node:zlib';

import {
  assemblePng,
  buildBmp,
  buildPng,
  buildRgbPng,
  PNG_COLOR,
  pngChunk,
  pngHeader,
  PNG_SIGNATURE,
} from '../../../test/support/images';
import { AnalyzableImage, MAX_IMAGE_PIXELS } from './decoded-image';
import { decodeImage, detectImageFormat } from './image-decoder';

const analyzable = async (file: Buffer) => {
  const image = await decodeImage(file);
  expect(image.analyzable).toBe(true);
  return image as AnalyzableImage;
};

const expectFailure = (file: Buffer, failure: 'corrupt' | 'too_large') =>
  expect(decodeImage(file)).rejects.toMatchObject({
    name: 'ImageDecodeError',
    failure,
  });

describe('detectImageFormat', () => {
  it('identifica por la firma real del archivo', () => {
    expect(detectImageFormat(buildRgbPng(1, 1))).toBe('png');
    expect(detectImageFormat(buildBmp(1, 1, Buffer.alloc(4)))).toBe('bmp');
    expect(detectImageFormat(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('decodificacion de PNG', () => {
  it('devuelve los pixeles RGB y sus canales de color', async () => {
    const image = await analyzable(
      buildRgbPng(2, 1, (x) => (x === 0 ? [1, 2, 3] : [4, 5, 6])),
    );

    expect(image).toMatchObject({
      format: 'png',
      width: 2,
      height: 1,
      bytesPerPixel: 3,
      channels: [
        { name: 'r', offset: 0 },
        { name: 'g', offset: 1 },
        { name: 'b', offset: 2 },
      ],
    });
    expect([...image.samples]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('excluye el canal alfa de los canales de color', async () => {
    const rgba = await analyzable(
      buildPng(1, 1, Buffer.from([0, 1, 2, 3, 255]), {
        colorType: PNG_COLOR.RGBA,
      }),
    );
    const grayAlpha = await analyzable(
      buildPng(1, 1, Buffer.from([0, 7, 255]), {
        colorType: PNG_COLOR.GRAY_ALPHA,
      }),
    );

    expect(rgba.bytesPerPixel).toBe(4);
    expect(rgba.channels.map((channel) => channel.name)).toEqual([
      'r',
      'g',
      'b',
    ]);
    expect(grayAlpha.bytesPerPixel).toBe(2);
    expect(grayAlpha.channels).toEqual([{ name: 'gray', offset: 0 }]);
  });

  it.each([
    ['Sub', 1, [10, 5], [15, 7], [10, 15, 15, 22]],
    ['Up', 2, [10, 20], [1, 2], [10, 20, 11, 22]],
    ['Average', 3, [10, 20], [5, 5], [10, 25, 10, 22]],
    ['Paeth', 4, [10, 20], [1, 2], [10, 30, 11, 32]],
  ])(
    'reconstruye las filas con el filtro %s',
    async (_name, filter, firstRow, secondRow, expected) => {
      const scanlines = Buffer.from([
        filter,
        ...firstRow,
        filter,
        ...secondRow,
      ]);

      const image = await analyzable(
        buildPng(2, 2, scanlines, { colorType: PNG_COLOR.GRAY }),
      );

      expect([...image.samples]).toEqual(expected);
    },
  );

  it.each([
    ['con paleta', 2, 2, { colorType: PNG_COLOR.PALETTE }, 3 * 2],
    ['de 16 bits', 2, 2, { bitDepth: 16 }, 13 * 2],
    ['de 1 bit', 8, 1, { colorType: PNG_COLOR.GRAY, bitDepth: 1 }, 2],
  ])(
    'marca como no analizable un PNG integro %s',
    async (_name, width, height, options, size) => {
      const image = await decodeImage(
        buildPng(width, height, Buffer.alloc(size), options),
      );

      expect(image).toMatchObject({ analyzable: false, width, height });
    },
  );

  it('valida el tamano de un PNG entrelazado y lo marca como no analizable', async () => {
    // En 2x2 hay datos en las pasadas 1, 6 y 7 con 1, 1 y 2 pixeles RGB.
    const size = 1 + 3 + (1 + 3) + 1 * (1 + 6);
    const interlaced = (bytes: number) =>
      buildPng(2, 2, Buffer.alloc(bytes), { interlace: 1 });

    await expect(decodeImage(interlaced(size))).resolves.toMatchObject({
      analyzable: false,
    });
    await expectFailure(interlaced(size - 1), 'corrupt');
  });

  it('rechaza un archivo truncado en cualquier punto', async () => {
    const file = buildRgbPng(4, 4);

    for (const length of [8, 20, 33, file.length - 13, file.length - 1]) {
      await expectFailure(file.subarray(0, length), 'corrupt');
    }
  });

  it('rechaza un CRC incorrecto', async () => {
    const file = Buffer.from(buildRgbPng(4, 4));
    file[file.length - 20] ^= 0xff;

    await expectFailure(file, 'corrupt');
  });

  it('rechaza datos despues de IEND', async () => {
    const file = Buffer.concat([buildRgbPng(2, 2), Buffer.from('PK')]);

    await expectFailure(file, 'corrupt');
  });

  it('rechaza un PNG que no empieza por IHDR, sin IDAT o sin IEND', async () => {
    const header = pngHeader(1, 1);
    const idat = pngChunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3])));

    await expectFailure(assemblePng(idat, header, pngChunk('IEND')), 'corrupt');
    await expectFailure(assemblePng(header, pngChunk('IEND')), 'corrupt');
    await expectFailure(assemblePng(header, idat), 'corrupt');
    await expectFailure(PNG_SIGNATURE, 'corrupt');
  });

  it('rechaza una cabecera con valores invalidos', async () => {
    const scanlines = Buffer.from([0, 1, 2, 3]);

    await expectFailure(buildPng(0, 1, scanlines), 'corrupt');
    await expectFailure(buildPng(1, 0, scanlines), 'corrupt');
    await expectFailure(buildPng(1, 1, scanlines, { colorType: 5 }), 'corrupt');
    await expectFailure(buildPng(1, 1, scanlines, { bitDepth: 4 }), 'corrupt');
    await expectFailure(buildPng(1, 1, scanlines, { interlace: 2 }), 'corrupt');
  });

  it('rechaza un filtro desconocido', async () => {
    await expectFailure(buildPng(1, 1, Buffer.from([5, 1, 2, 3])), 'corrupt');
  });

  it('rechaza datos que no son zlib o que no coinciden con las dimensiones', async () => {
    const withIdat = (data: Buffer) =>
      assemblePng(pngHeader(1, 1), pngChunk('IDAT', data), pngChunk('IEND'));

    await expectFailure(withIdat(Buffer.from('no-es-zlib')), 'corrupt');
    await expectFailure(buildPng(2, 2, Buffer.from([0, 1, 2])), 'corrupt');
    await expectFailure(buildPng(1, 1, Buffer.alloc(5)), 'corrupt');
  });

  it('no descomprime una imagen que declara mas pixeles que el limite', async () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1;
    const bomb = assemblePng(
      pngHeader(side, side),
      pngChunk('IDAT', deflateSync(Buffer.alloc(16))),
      pngChunk('IEND'),
    );

    await expectFailure(bomb, 'too_large');
  });

  it('detiene la descompresion cuando los datos superan lo declarado', async () => {
    // 64 MB comprimidos en pocos KB dentro de una imagen que declara 1x1.
    const bomb = buildPng(1, 1, Buffer.alloc(64 * 1024 * 1024));

    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expectFailure(bomb, 'corrupt');
  });
});

describe('decodificacion de BMP', () => {
  // 2x2 en BGR, con 2 bytes de relleno por fila.
  const twoRows = Buffer.from([
    1, 2, 3, 4, 5, 6, 0, 0, 7, 8, 9, 10, 11, 12, 0, 0,
  ]);

  it('devuelve los pixeles sin relleno y en el orden del archivo', async () => {
    const image = await analyzable(buildBmp(2, 2, twoRows));

    expect(image).toMatchObject({
      format: 'bmp',
      width: 2,
      height: 2,
      bytesPerPixel: 3,
      channels: [
        { name: 'r', offset: 2 },
        { name: 'g', offset: 1 },
        { name: 'b', offset: 0 },
      ],
    });
    expect([...image.samples]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('admite altura negativa (filas de arriba hacia abajo) y 32 bits', async () => {
    const topDown = await analyzable(
      buildBmp(2, 2, twoRows, { topDown: true }),
    );
    const bgrx = await analyzable(
      buildBmp(1, 1, Buffer.from([1, 2, 3, 255]), { bitCount: 32 }),
    );

    expect(topDown.height).toBe(2);
    expect(bgrx.bytesPerPixel).toBe(4);
  });

  it.each([
    ['de paleta', { bitCount: 8 }, 4],
    ['con BITFIELDS', { bitCount: 32, compression: 3 }, 4],
    ['con RLE', { bitCount: 8, compression: 1 }, 2],
  ])(
    'marca como no analizable un BMP %s',
    async (_name, options, pixelBytes) => {
      const image = await decodeImage(
        buildBmp(1, 1, Buffer.alloc(pixelBytes), options),
      );

      expect(image.analyzable).toBe(false);
    },
  );

  it('rechaza un BMP truncado', async () => {
    const file = buildBmp(2, 2, twoRows);

    await expectFailure(file.subarray(0, 20), 'corrupt');
    await expectFailure(file.subarray(0, file.length - 1), 'corrupt');
  });

  it('admite relleno final pero rechaza datos despues de los pixeles', async () => {
    const file = buildBmp(2, 2, twoRows);

    await analyzable(Buffer.concat([file, Buffer.alloc(3)]));
    await expectFailure(Buffer.concat([file, Buffer.alloc(4)]), 'corrupt');
  });

  it('rechaza una cabecera con valores invalidos', async () => {
    const patched = (write: (file: Buffer) => void) => {
      const file = Buffer.from(buildBmp(2, 2, twoRows));
      write(file);
      return file;
    };

    await expectFailure(
      patched((f) => f.writeUInt32LE(12, 14)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeInt32LE(0, 18)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeInt32LE(0, 22)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeUInt16LE(2, 26)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeUInt16LE(7, 28)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeUInt32LE(9, 30)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeUInt32LE(5, 10)),
      'corrupt',
    );
    await expectFailure(
      patched((f) => f.writeUInt32LE(0xffffff, 10)),
      'corrupt',
    );
  });

  it('aplica el limite de pixeles antes de procesar', async () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1;

    await expectFailure(buildBmp(side, side, Buffer.alloc(16)), 'too_large');
  });

  it('aplica el limite con la altura negativa mas extrema', async () => {
    const file = Buffer.from(buildBmp(2, 2, twoRows));
    file.writeInt32LE(-2147483648, 22);

    await expectFailure(file, 'too_large');
  });
});
