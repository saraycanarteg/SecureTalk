import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { RevokedTokensService } from './revoked-tokens.service';
import { TokenClaims, TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user: TokenClaims;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly revokedTokens: RevokedTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];

    if (!token) {
      this.reject(req, 'ausente');
    }

    try {
      req.user = await this.tokens.verify(token as string);
    } catch (error) {
      this.reject(req, (error as { code?: string }).code ?? 'invalido');
    }

    // Fuera del try: si la BD falla responde 500 y la peticion tampoco pasa.
    if (await this.revokedTokens.isRevoked(req.user.jti)) {
      this.reject(req, 'revocado');
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
