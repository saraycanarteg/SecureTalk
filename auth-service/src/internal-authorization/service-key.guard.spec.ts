import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';
import { ServiceKeyGuard } from './service-key.guard';

const KEY = 'clave-de-servicio-de-al-menos-32-caracteres';

describe('ServiceKeyGuard: canal', () => {
  const guardFor = (nodeEnv: string) =>
    new ServiceKeyGuard({
      get: (name: string) => (name === 'NODE_ENV' ? nodeEnv : KEY),
    } as unknown as ConfigService<Env, true>);

  const contextFor = (encrypted: boolean, key = KEY) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-service-key': key }, socket: { encrypted } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('en produccion rechaza la clave correcta si llega sin cifrar', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');

    expect(() => guardFor('production').canActivate(contextFor(false))).toThrow(
      UnauthorizedException,
    );
    expect(warn.mock.calls.join()).toContain('motivo=canal_sin_tls');
    expect(warn.mock.calls.join()).not.toContain(KEY);
  });

  it('en produccion acepta la clave correcta por HTTPS', () => {
    expect(guardFor('production').canActivate(contextFor(true))).toBe(true);
  });

  it('en produccion rechaza una clave incorrecta aunque llegue por HTTPS', () => {
    expect(() => guardFor('production').canActivate(contextFor(true, 'otra'))).toThrow(
      UnauthorizedException,
    );
  });

  it('en desarrollo permite HTTP para las pruebas manuales', () => {
    expect(guardFor('development').canActivate(contextFor(false))).toBe(true);
  });
});
