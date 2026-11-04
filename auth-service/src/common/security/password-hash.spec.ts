import { hashPassword, verifyPassword } from './password-hash';

describe('password-hash', () => {
  it('usa Argon2id con 19 MiB, 2 iteraciones y paralelismo 1', async () => {
    const hash = await hashPassword('una-contrasena-de-prueba');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it('verifica solo la contrasena correcta', async () => {
    const hash = await hashPassword('una-contrasena-de-prueba');

    await expect(verifyPassword(hash, 'una-contrasena-de-prueba')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'otra-contrasena')).resolves.toBe(false);
  });
});
