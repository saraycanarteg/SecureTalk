import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema.js';
import { QuarantineStore } from './quarantine.store';

// Windows no aplica los permisos POSIX: alli no se pueden comprobar.
const itOnPosix = process.platform === 'win32' ? it.skip : it;

describe('QuarantineStore', () => {
  let root: string;
  let quarantineDir: string;
  let store: QuarantineStore;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'securetalk-quarantine-'));
    quarantineDir = join(root, 'aislada', 'cuarentena');
    store = new QuarantineStore({
      get: () => quarantineDir,
    } as unknown as ConfigService<Env, true>);
    await store.onModuleInit();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('crea la carpeta al arrancar', () => {
    expect(existsSync(quarantineDir)).toBe(true);
  });

  itOnPosix('restringe la carpeta al usuario del servicio', () => {
    expect(statSync(quarantineDir).mode & 0o777).toBe(0o700);
  });

  it('mueve el archivo conservando su contenido y su nombre', async () => {
    const original = join(root, 'nombre-aleatorio');
    writeFileSync(original, 'contenido');

    const target = await store.move(original);

    expect(target).toBe(join(quarantineDir, 'nombre-aleatorio'));
    expect(existsSync(original)).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe('contenido');
  });

  itOnPosix('deja el archivo en solo lectura y sin ejecucion', async () => {
    const original = join(root, 'ejecutable');
    writeFileSync(original, 'contenido', { mode: 0o755 });

    const target = await store.move(original);

    expect(statSync(target).mode & 0o777).toBe(0o400);
  });

  it('falla si el archivo no existe', async () => {
    await expect(store.move(join(root, 'no-existe'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
