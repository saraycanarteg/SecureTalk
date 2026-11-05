import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { uniqueViolationConstraint } from '../common/database/unique-violation';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleListResponseDto, RoleResponseDto } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
  ) {}

  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const saved = await this.save(this.roles.create(dto));
    this.logger.log(`rol_creado roleId=${saved.id} rol=${saved.rol}`);
    return this.toResponse(saved);
  }

  async findAll({ page, limit }: PaginationQueryDto): Promise<RoleListResponseDto> {
    const [roles, total] = await this.roles.findAndCount({
      order: { rol: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: roles.map((role) => this.toResponse(role)), page, limit, total };
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.roles.findOneBy({ id });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    Object.assign(role, dto);
    const saved = await this.save(role);
    this.logger.log(`rol_actualizado roleId=${saved.id} campos=${Object.keys(dto).join(',')}`);
    return this.toResponse(saved);
  }

  private async save(role: Role): Promise<Role> {
    try {
      return await this.roles.save(role);
    } catch (error) {
      if (uniqueViolationConstraint(error) === 'UQ_roles_rol') {
        throw new ConflictException('El rol ya existe');
      }
      throw error;
    }
  }

  private toResponse(role: Role): RoleResponseDto {
    return {
      id: role.id,
      rol: role.rol,
      description: role.description,
      estado: role.estado,
      fechaCreacion: role.fechaCreacion,
      fechaActualizacion: role.fechaActualizacion,
    };
  }
}
