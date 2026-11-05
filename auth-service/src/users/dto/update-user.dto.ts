import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';

import { CreateUserDto } from './create-user.dto';

// Un null se valida y responde 400: no debe llegar a columnas NOT NULL.
export class UpdateUserDto extends PartialType(CreateUserDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ description: 'false desactiva al usuario sin borrarlo' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  estado?: boolean;
}
