import { BadRequestException } from '@nestjs/common';

import { CedulaPipe, isValidCedula } from './cedula.pipe';

describe('isValidCedula', () => {
  it.each(['1710034065', '0926687856'])('acepta %s', (cedula) => {
    expect(isValidCedula(cedula)).toBe(true);
  });

  it.each([
    ['digito verificador incorrecto', '1710034064'],
    ['provincia 00', '0010034065'],
    ['provincia 25', '2510034065'],
    ['tercer digito mayor a 5', '1760034065'],
    ['menos de 10 digitos', '171003406'],
    ['mas de 10 digitos', '17100340650'],
    ['caracteres no numericos', '17100340a5'],
    ['todos ceros', '0000000000'],
  ])('rechaza %s', (_motivo, cedula) => {
    expect(isValidCedula(cedula)).toBe(false);
  });
});

describe('CedulaPipe', () => {
  const pipe = new CedulaPipe();

  it('devuelve el cuerpo intacto si la cedula es valida', () => {
    const body = { cedula: '1710034065', nombres: 'Ana' };

    expect(pipe.transform(body)).toBe(body);
  });

  it('permite un cuerpo sin cedula', () => {
    const body: { cedula?: string; nombres: string } = { nombres: 'Ana' };

    expect(pipe.transform(body)).toBe(body);
  });

  it('responde 400 con una cedula invalida', () => {
    expect(() => pipe.transform({ cedula: '1710034064' })).toThrow(BadRequestException);
  });
});
