import { meetsPasswordPolicy } from './password-policy';

describe('meetsPasswordPolicy', () => {
  it.each([
    ['minuscula, mayuscula y digito', 'Abcdefg1'],
    ['minuscula, mayuscula y simbolo', 'Abcdefg!'],
    ['minuscula, digito y simbolo', 'abcdef1!'],
    ['mayuscula, digito y simbolo', 'ABCDEF1!'],
    ['los 4 tipos', 'Abcdef1!'],
    ['letras con tilde', 'Ñandú-123'],
  ])('acepta %s', (_motivo, password) => {
    expect(meetsPasswordPolicy(password)).toBe(true);
  });

  it.each([
    ['menos de 8 caracteres', 'Abcde1!'],
    ['solo 2 tipos', 'abcdefg1'],
    ['solo 1 tipo', 'abcdefgh'],
    ['mas de 128 caracteres', `Aa1!${'x'.repeat(125)}`],
    ['un valor que no es texto', 12345678],
  ])('rechaza %s', (_motivo, password) => {
    expect(meetsPasswordPolicy(password)).toBe(false);
  });
});
