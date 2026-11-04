import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AuthzAction, AuthzClient } from './authz.client';

const AUTHZ_ACTION_KEY = 'authz_action';

export const RequireAction = (action: AuthzAction) =>
  SetMetadata(AUTHZ_ACTION_KEY, action);

// Debe ejecutarse despues de JwtAuthGuard, que deja el token verificado en la peticion.
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly client: AuthzClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<AuthzAction | undefined>(
      AUTHZ_ACTION_KEY,
      context.getHandler(),
    );
    // Una ruta sin accion declarada es un error de programacion: se niega por defecto.
    if (!action) {
      throw new ServiceUnavailableException();
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = await this.client.isAllowed({
      subjectId: req.user.sub,
      subjectToken: req.subjectToken,
      action,
      resourceId: typeof req.params.id === 'string' ? req.params.id : null,
      requestId: req.requestId,
    });

    if (allowed !== true) {
      throw new ForbiddenException('Operacion no autorizada');
    }
    return true;
  }
}
