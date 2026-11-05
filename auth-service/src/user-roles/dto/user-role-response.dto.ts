import { ApiProperty } from '@nestjs/swagger';

export class UserRoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty()
  assignedAt!: Date;
}
