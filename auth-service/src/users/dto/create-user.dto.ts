import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsISO8601, IsString, Length, Matches } from 'class-validator';

import {
  IsPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/password-policy';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto {
  @ApiProperty({
    example: '1710034065',
    description: 'Cedula ecuatoriana: provincia, tercer digito y digito verificador',
  })
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'cedula debe tener 10 digitos' })
  cedula!: string;

  @ApiProperty({ example: 'Ana Maria', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  nombres!: string;

  @ApiProperty({ example: 'Perez Lopez', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  apellidos!: string;

  @ApiProperty({ example: '1990-01-31', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaNacimiento debe tener el formato AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  fechaNacimiento!: string;

  @ApiProperty({ example: 'ana.perez', minLength: 3, maxLength: 50 })
  @IsString()
  @Length(3, 50)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'username solo admite letras, digitos, punto, guion y guion bajo',
  })
  username!: string;

  @ApiProperty({ example: 'ana@example.com', maxLength: 150 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @Length(3, 150)
  email!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Al menos 3 de 4 tipos: minuscula, mayuscula, digito y simbolo',
  })
  @IsPasswordPolicy()
  password!: string;
}
