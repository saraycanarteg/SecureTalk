import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assemblePng,
  buildBmp,
  buildPng,
  buildRgbPng,
  pngChunk,
  pngHeader,
} from '../../../test/support/images';
import { MAX_IMAGE_PIXELS } from '../image/decoded-image';
import { MAX_FILE_SIZE_BYTES } from './file-validator.interface';
import { ImageFileValidator } from './image-file.validator';

describe('ImageFileValidator', () => {
  const validator = new ImageFileValidator();
  const png = buildRgbPng(4, 4);
  const bmp = buildBmp(1, 1, Buffer.from([1, 2, 3, 0]));

  let dir: string;
  let path: string;

  const validate = (
    content: Buffer,
    originalName = 'muestra.png',
    mimeType = 'image/png',
    size = content.length,
  ) => {
    writeFileSync(path, content);
    return validator.validate({ path, originalName, mimeType, size });
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'securetalk-validator-'));
    path = join(dir, 'archivo');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('archivos validos', () => {
    it('acepta PNG y BMP con extension, tipo y firma coherentes', async () => {
      await expect(validate(png)).resolves.toEqual({ valid: true });
      await expect(validate(bmp, 'a.bmp', 'image/bmp')).resolves.toEqual({
        valid: true,
      });
      await expect(validate(bmp, 'a.bmp', 'image/x-ms-bmp')).resolves.toEqual({
        valid: true,
      });
    });

    it('no distingue mayusculas en la extension ni en el tipo', async () => {
      await expect(validate(png, 'FOTO.PNG', 'IMAGE/PNG')).resolves.toEqual({
        valid: true,
      });
    });

    it('acepta una variante integra aunque la tecnica no pueda analizarla', async () => {
      const palette = buildPng(1, 1, Buffer.alloc(2), { colorType: 3 });

      await expect(validate(palette)).resolves.toEqual({ valid: true });
    });
  });

  describe('T10: formatos no admitidos (415)', () => {
    it.each([
      ['otra extension', 'virus.exe', 'image/png'],
      ['doble extension', 'foto.png.exe', 'image/png'],
      ['sin extension', 'foto', 'image/png'],
      ['terminado en punto', 'foto.png.', 'image/png'],
      ['otro tipo de contenido', 'foto.png', 'text/html'],
      ['tipo de otro formato', 'foto.png', 'image/bmp'],
      ['tipo vacio', 'foto.png', ''],
    ])('rechaza %s', async (_name, originalName, mimeType) => {
      await expect(
        validate(png, originalName, mimeType),
      ).resolves.toMatchObject({ valid: false, statusCode: 415 });
    });

    it('rechaza un contenido sin firma de imagen renombrado a .png', async () => {
      await expect(
        validate(Buffer.from('<script>alert(1)</script>')),
      ).resolves.toMatchObject({ valid: false, statusCode: 415 });
    });

    it('rechaza un BMP renombrado a .png y un PNG renombrado a .bmp', async () => {
      await expect(validate(bmp)).resolves.toMatchObject({ statusCode: 415 });
      await expect(validate(png, 'a.bmp', 'image/bmp')).resolves.toMatchObject({
        statusCode: 415,
      });
    });
  });

  describe('T10: archivos corruptos (400)', () => {
    const corruptCrc = Buffer.from(png);
    corruptCrc[corruptCrc.length - 20] ^= 0xff;

    it.each([
      ['vacio', Buffer.alloc(0)],
      ['truncado', png.subarray(0, png.length - 10)],
      ['con CRC incorrecto', corruptCrc],
      ['con datos despues de IEND', Buffer.concat([png, Buffer.from('PK')])],
      [
        'con datos que no son zlib',
        assemblePng(
          pngHeader(1, 1),
          pngChunk('IDAT', Buffer.from('no-es-zlib')),
          pngChunk('IEND'),
        ),
      ],
    ])('rechaza un PNG %s', async (_name, content) => {
      await expect(validate(content)).resolves.toMatchObject({
        valid: false,
        statusCode: 400,
      });
    });

    it('rechaza un BMP truncado', async () => {
      await expect(
        validate(bmp.subarray(0, bmp.length - 1), 'a.bmp', 'image/bmp'),
      ).resolves.toMatchObject({ valid: false, statusCode: 400 });
    });
  });

  describe('T10: limites excedidos (413)', () => {
    it('rechaza por el tamaño sin leer el archivo', async () => {
      await expect(
        validate(png, 'muestra.png', 'image/png', MAX_FILE_SIZE_BYTES + 1),
      ).resolves.toMatchObject({ valid: false, statusCode: 413 });
    });

    it('rechaza una bomba de descompresion por sus dimensiones', async () => {
      const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1;
      const bomb = assemblePng(
        pngHeader(side, side),
        pngChunk('IDAT', Buffer.alloc(16)),
        pngChunk('IEND'),
      );

      await expect(validate(bomb)).resolves.toMatchObject({
        valid: false,
        statusCode: 413,
      });
    });
  });

  it('no incluye datos del cliente en el motivo del rechazo', async () => {
    const name = 'nombre-del-cliente\n.exe';

    const result = await validate(png, name);

    expect(JSON.stringify(result)).not.toContain('nombre-del-cliente');
  });

  it('propaga un error de lectura para que no se confunda con un archivo corrupto', async () => {
    await expect(
      validator.validate({
        path: join(dir, 'no-existe'),
        originalName: 'a.png',
        mimeType: 'image/png',
        size: 10,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
