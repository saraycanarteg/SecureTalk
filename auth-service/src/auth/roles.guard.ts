import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './auth.guard';
import { AuthorizationService } from './authorization.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const active = await this.authorization.getActiveRoles(req.user.sub);

    // Una ruta con este guard y sin @Roles se deniega: olvidar el decorador no abre la ruta.
    const allowed = required?.some((role) => active.includes(role)) ?? false;
    const details =
      `userId=${req.user.sub} requeridos=${required?.join(',') ?? 'ninguno'} ` +
      `ruta="${req.method} ${req.path}" ip=${req.ip} requestId=${req.requestId}`;

    if (!allowed) {
      this.logger.warn(`acceso_denegado ${details}`);
      throw new ForbiddenException('No tienes permiso para esta operacion');
    }
    this.logger.log(`acceso_permitido ${details}`);
    return true;
  }
}
