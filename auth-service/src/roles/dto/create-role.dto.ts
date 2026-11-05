import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateRoleDto {
  // En mayusculas para que "admin" y "ADMIN" no puedan existir como roles distintos.
  @ApiProperty({ example: 'AUDITOR', minLength: 2, maxLength: 50 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'rol solo admite letras, digitos y guion bajo, y debe empezar con una letra',
  })
  rol!: string;

  @ApiPropertyOptional({ example: 'Revisa los registros de auditoria', maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string | null;
}
