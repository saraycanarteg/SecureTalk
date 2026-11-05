import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { UserRolesController } from './user-roles.controller';
import { UserRolesService } from './user-roles.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, User, Role])],
  controllers: [UserRolesController],
  providers: [UserRolesService],
})
export class UserRolesModule {}
