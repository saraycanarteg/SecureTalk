import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../common/dto/pagination-query.dto/pagination-query.dto';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  cedula!: string;

  @ApiProperty()
  nombres!: string;

  @ApiProperty()
  apellidos!: string;

  @ApiProperty({ format: 'date' })
  fechaNacimiento!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  estado!: boolean;

  @ApiProperty()
  fechaCreacion!: Date;

  @ApiProperty()
  fechaActualizacion!: Date;
}

export class UserListResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [UserResponseDto] })
  data!: UserResponseDto[];
}
