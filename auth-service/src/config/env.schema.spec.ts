import { validateEnv } from './env.schema';

describe('validateEnv: canal interno', () => {
  const base = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'usuario',
    DB_PASSWORD: 'contrasena-larga',
    DB_DATABASE: 'base',
    JWT_PRIVATE_KEY_PATH: 'privada.pem',
    JWT_PUBLIC_KEY_PATH: 'publica.pem',
    STEGO_SERVICE_KEY: 'a'.repeat(32),
  };

  it('el HTTPS interno es opcional fuera de produccion', () => {
    expect(validateEnv(base)).toMatchObject({ INTERNAL_TLS_PORT: 3443 });
  });

  it('en produccion exige el HTTPS interno', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/INTERNAL_TLS/);
  });

  it('acepta el certificado junto con su llave', () => {
    expect(() =>
      validateEnv({
        ...base,
        INTERNAL_TLS_CERT_PATH: 'auth.crt',
        INTERNAL_TLS_KEY_PATH: 'auth.key',
      }),
    ).not.toThrow();
  });

  it.each([
    ['solo el certificado', { INTERNAL_TLS_CERT_PATH: 'auth.crt' }],
    ['solo la llave', { INTERNAL_TLS_KEY_PATH: 'auth.key' }],
  ])('se niega a arrancar con %s', (_motivo, partial) => {
    expect(() => validateEnv({ ...base, ...partial })).toThrow(/INTERNAL_TLS/);
  });
});
