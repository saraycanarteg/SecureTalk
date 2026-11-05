import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../common/dto/pagination-query.dto/pagination-query.dto';

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  rol!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  estado!: boolean;

  @ApiProperty()
  fechaCreacion!: Date;

  @ApiProperty()
  fechaActualizacion!: Date;
}

export class RoleListResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [RoleResponseDto] })
  data!: RoleResponseDto[];
}
