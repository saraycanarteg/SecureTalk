import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const SECRET = 'valor-secreto-que-no-debe-aparecer';
  const base = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'usuario',
    DB_PASSWORD: 'contrasena-larga',
    DB_DATABASE: 'base',
    JWT_PUBLIC_KEY_PATH: 'llave.pem',
    AUTH_BASE_URL: 'http://localhost:3001',
    STEGO_SERVICE_KEY: 'a'.repeat(32),
    UPLOAD_DIR: './uploads',
    QUARANTINE_DIR: './quarantine',
  };

  it('usa los valores por defecto de autorizacion', () => {
    expect(validateEnv(base)).toMatchObject({
      AUTHZ_MODE: 'real',
      AUTH_TIMEOUT_MS: 3000,
    });
  });

  it('se niega a arrancar con AUTHZ_MODE=mock en produccion', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', AUTHZ_MODE: 'mock' }),
    ).toThrow(/AUTHZ_MODE/);
  });

  it('en produccion exige HTTPS hacia AUTH', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AUTH_BASE_URL/);
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', AUTH_BASE_URL: 'https://auth-service:3443' }),
    ).not.toThrow();
  });

  it('permite AUTHZ_MODE=mock en desarrollo', () => {
    expect(
      validateEnv({ ...base, NODE_ENV: 'development', AUTHZ_MODE: 'mock' }).AUTHZ_MODE,
    ).toBe('mock');
  });

  it('exige una carpeta de cuarentena distinta de la de subida', () => {
    expect(() =>
      validateEnv({ ...base, QUARANTINE_DIR: './carpeta/../uploads' }),
    ).toThrow(/QUARANTINE_DIR/);
  });

  it('no muestra valores en el mensaje de error', () => {
    expect(() =>
      validateEnv({ ...base, STEGO_SERVICE_KEY: 'corta', DB_PASSWORD: undefined, AUTH_BASE_URL: SECRET }),
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(SECRET),
      }),
    );
  });
});
