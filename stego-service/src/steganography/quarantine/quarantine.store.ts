import { chmod, mkdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema.js';

// Solo el usuario del servicio puede entrar a la carpeta.
const DIRECTORY_MODE = 0o700;
// Se conserva como evidencia: solo lectura y sin permiso de ejecucion.
const FILE_MODE = 0o400;

// La carpeta no se publica por HTTP y el archivo conserva su nombre aleatorio y sin extension.
@Injectable()
export class QuarantineStore implements OnModuleInit {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get directory(): string {
    return this.config.get('QUARANTINE_DIR', { infer: true });
  }

  async onModuleInit() {
    await mkdir(this.directory, { recursive: true, mode: DIRECTORY_MODE });
    await chmod(this.directory, DIRECTORY_MODE);
  }

  // rename es atomico porque ambas carpetas estan en el mismo sistema de archivos. Si algo
  // falla, el archivo sigue en su ruta original y el servicio lo elimina.
  async move(filePath: string): Promise<string> {
    const target = join(this.directory, basename(filePath));
    await chmod(filePath, FILE_MODE);
    await rename(filePath, target);
    return target;
  }
}
