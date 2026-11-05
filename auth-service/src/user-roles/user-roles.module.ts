import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { UserRolesController } from './user-roles.controller';
import { UserRolesService } from './user-roles.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, User, Role]), AuthModule],
  controllers: [UserRolesController],
  providers: [UserRolesService],
})
export class UserRolesModule {}
