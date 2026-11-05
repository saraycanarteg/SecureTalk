import { createHash, timingSafeEqual } from 'node:crypto';
import type { TLSSocket } from 'node:tls';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../config/env.schema.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class ServiceKeyGuard implements CanActivate {
  private readonly logger = new Logger(ServiceKeyGuard.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    const provided = req.headers['x-service-key'];

    // En produccion la clave y el JWT nunca se aceptan por un canal sin cifrar.
    const encrypted = (req.socket as TLSSocket).encrypted === true;
    if (this.config.get('NODE_ENV', { infer: true }) === 'production' && !encrypted) {
      this.logger.warn(`servicio_rechazado motivo=canal_sin_tls ip=${req.ip} requestId=${req.requestId}`);
      throw new UnauthorizedException('Servicio no autenticado');
    }

    if (typeof provided !== 'string' || !this.matches(provided)) {
      // El valor recibido nunca se registra: podria ser una clave casi correcta.
      this.logger.warn(
        `servicio_rechazado motivo=${provided ? 'incorrecta' : 'ausente'} ip=${req.ip} requestId=${req.requestId}`,
      );
      throw new UnauthorizedException('Servicio no autenticado');
    }
    return true;
  }

  // timingSafeEqual exige el mismo largo: al comparar hashes tampoco se revela el de la clave.
  private matches(provided: string): boolean {
    const expected = this.config.get('STEGO_SERVICE_KEY', { infer: true });
    return timingSafeEqual(sha256(provided), sha256(expected));
  }
}
