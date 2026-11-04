import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { TokenClaims, TokenVerifier } from './token-verifier.service';

export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user: TokenClaims;
  subjectToken: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly tokens: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];

    if (!token) {
      this.reject(req, 'ausente');
    }

    try {
      req.user = await this.tokens.verify(token as string);
      req.subjectToken = token as string;
    } catch (error) {
      this.reject(req, (error as { code?: string }).code ?? 'invalido');
    }
    return true;
  }

  // El motivo queda en el log; el cliente recibe siempre la misma respuesta.
  private reject(req: AuthenticatedRequest, reason: string): never {
    this.logger.warn(
      `token_rechazado motivo=${reason} ip=${req.ip} requestId=${req.requestId}`,
    );
    throw new UnauthorizedException('No autenticado');
  }
}
