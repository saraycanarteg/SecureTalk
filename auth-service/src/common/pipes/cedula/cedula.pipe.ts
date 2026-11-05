import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const COEFFICIENTS = [2, 1, 2, 1, 2, 1, 2, 1, 2];
const FOREIGN_PROVINCE = 30;
const LAST_PROVINCE = 24;
const LAST_NATURAL_PERSON_DIGIT = 5;

// Provincia (01-24 o 30), tercer digito de persona natural y digito verificador modulo 10.
export function isValidCedula(cedula: string): boolean {
  if (!/^[0-9]{10}$/.test(cedula)) {
    return false;
  }

  const digits = [...cedula].map(Number);
  const province = digits[0] * 10 + digits[1];
  const validProvince =
    (province >= 1 && province <= LAST_PROVINCE) || province === FOREIGN_PROVINCE;
  if (!validProvince || digits[2] > LAST_NATURAL_PERSON_DIGIT) {
    return false;
  }

  const sum = COEFFICIENTS.reduce((total, coefficient, index) => {
    const product = digits[index] * coefficient;
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return (10 - (sum % 10)) % 10 === digits[9];
}

// Se aplica al cuerpo completo: en un PATCH la cedula puede no venir.
@Injectable()
export class CedulaPipe implements PipeTransform {
  transform<T extends { cedula?: string }>(value: T): T {
    if (value?.cedula !== undefined && !isValidCedula(value.cedula)) {
      throw new BadRequestException('La cedula no es valida');
    }
    return value;
  }
}
