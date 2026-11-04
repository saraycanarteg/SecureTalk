import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthzClient } from './authz.client';

describe('AuthzClient en modo mock', () => {
  const config = { get: () => 'mock' } as unknown as ConfigService<any, true>;
  const request = {
    subjectId: 'usuario',
    subjectToken: 'token',
    action: 'steganography.analyze' as const,
    resourceId: null,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('avisa en el log al arrancar', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    new AuthzClient(config).onModuleInit();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AUTHZ_MODE=mock'));
  });

  it('permite la operacion sin consultar a AUTH', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(new AuthzClient(config).isAllowed(request)).resolves.toBe(true);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
