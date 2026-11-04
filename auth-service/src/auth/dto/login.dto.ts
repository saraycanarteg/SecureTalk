import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', minLength: 1, maxLength: 50 })
  @IsString()
  @Length(1, 50)
  username!: string;

  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}
