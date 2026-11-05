import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';

import { CreateRoleDto } from './create-role.dto';

// Un null se valida y responde 400: no debe llegar a columnas NOT NULL.
// La descripcion si admite null porque su columna es opcional.
export class UpdateRoleDto extends PartialType(CreateRoleDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ description: 'false desactiva el rol sin borrarlo' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  estado?: boolean;
}
