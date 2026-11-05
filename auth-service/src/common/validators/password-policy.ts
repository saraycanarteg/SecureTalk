import { registerDecorator, ValidationOptions } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const REQUIRED_CHARACTER_TYPES = 3;

const CHARACTER_TYPES = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u];

// Minimo 8 caracteres y 3 de 4 tipos: minuscula, mayuscula, digito y simbolo.
export function meetsPasswordPolicy(password: unknown): boolean {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return false;
  }
  const types = CHARACTER_TYPES.filter((type) => type.test(password)).length;
  return types >= REQUIRED_CHARACTER_TYPES;
}

export function IsPasswordPolicy(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isPasswordPolicy',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: meetsPasswordPolicy,
        defaultMessage: () =>
          `password debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres ` +
          'e incluir al menos 3 de estos tipos: minuscula, mayuscula, digito y simbolo',
      },
    });
  };
}
