import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorizationService } from './authorization.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextFor = () =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'user-1', jti: 'jti-1' }, method: 'GET', path: '/x' }),
      }),
    }) as unknown as ExecutionContext;

  const guardWith = (required: string[] | undefined, active: string[]) => {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    const authorization = {
      getActiveRoles: async () => active,
    } as unknown as AuthorizationService;
    return new RolesGuard(reflector, authorization);
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permite si uno de los roles vigentes es requerido', async () => {
    await expect(
      guardWith(['ADMIN'], ['USER', 'ADMIN']).canActivate(contextFor()),
    ).resolves.toBe(true);
  });

  it('deniega si ningun rol vigente es requerido', async () => {
    await expect(guardWith(['ADMIN'], ['USER']).canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deniega a un usuario sin roles', async () => {
    await expect(guardWith(['ADMIN'], []).canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deniega por defecto si la ruta no declara @Roles', async () => {
    await expect(guardWith(undefined, ['ADMIN']).canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
  });
});
