import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Los nombres en snake_case siguen el Anexo B y docs/contrato-auth-stego.md.
export class AuthorizationCheckDto {
  @ApiProperty({ description: 'JWT recibido del cliente. AUTH lo valida de nuevo' })
  @IsString()
  @IsNotEmpty()
  subject_token!: string;

  // Sin lista de valores: una accion desconocida debe recibir una decision de denegar, no un 400.
  @ApiProperty({ example: 'steganography.analyze', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action!: string;

  // Sin formato: segun el contrato, STEGO puede enviarlo antes de validarlo.
  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  @IsOptional()
  @IsString()
  resource_id?: string | null;
}

export class AuthorizationDecisionDto {
  @ApiProperty({ format: 'uuid' })
  subject_id!: string;

  @ApiProperty({ example: 'steganography.analyze' })
  action!: string;

  @ApiProperty()
  allowed!: boolean;

  @ApiProperty({ example: 'active_role_grants_permission', maxLength: 200 })
  reason!: string;
}
