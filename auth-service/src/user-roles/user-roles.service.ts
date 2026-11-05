import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { uniqueViolationConstraint } from '../common/database/unique-violation';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRoleResponseDto } from './dto/user-role-response.dto';
import { UserRole } from './entities/user-role.entity';

@Injectable()
export class UserRolesService {
  private readonly logger = new Logger(UserRolesService.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
  ) {}

  async create({ userId, roleId }: CreateUserRoleDto): Promise<UserRoleResponseDto> {
    if (!(await this.users.existsBy({ id: userId }))) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!(await this.roles.existsBy({ id: roleId }))) {
      throw new NotFoundException('Rol no encontrado');
    }

    const saved = await this.insert(userId, roleId);
    this.logger.log(`rol_asignado userRoleId=${saved.id} userId=${userId} roleId=${roleId}`);
    return {
      id: saved.id,
      userId: saved.userId,
      roleId: saved.roleId,
      assignedAt: saved.assignedAt,
    };
  }

  async remove(id: string): Promise<void> {
    const assignment = await this.userRoles.findOneBy({ id });
    if (!assignment) {
      throw new NotFoundException('Asignacion no encontrada');
    }

    await this.userRoles.delete({ id });
    this.logger.log(
      `rol_retirado userRoleId=${id} userId=${assignment.userId} roleId=${assignment.roleId}`,
    );
  }

  private async insert(userId: string, roleId: string): Promise<UserRole> {
    try {
      return await this.userRoles.save(this.userRoles.create({ userId, roleId }));
    } catch (error) {
      if (uniqueViolationConstraint(error) === 'UQ_user_roles_user_role') {
        throw new ConflictException('El usuario ya tiene ese rol');
      }
      throw error;
    }
  }
}
