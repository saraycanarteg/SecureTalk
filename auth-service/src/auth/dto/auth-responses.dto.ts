import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT firmado con EdDSA (Ed25519)' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900, description: 'Vigencia del token en segundos' })
  expiresIn!: number;
}

export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  nombres!: string;

  @ApiProperty()
  apellidos!: string;
}

export class ErrorResponseDto {
  @ApiProperty()
  statusCode!: number;

  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];

  @ApiProperty()
  requestId!: string;
}
