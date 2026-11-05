import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { uniqueViolationConstraint } from '../common/database/unique-violation';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto';
import { hashPassword } from '../common/security/password-hash';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListResponseDto, UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';

const CONFLICT_MESSAGES: Record<string, string> = {
  UQ_users_username: 'El username ya existe',
  UQ_users_email: 'El email ya existe',
  UQ_users_cedula: 'La cedula ya existe',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const { password, ...data } = dto;
    const user = this.users.create({
      ...data,
      passwordHash: await hashPassword(password),
    });

    const saved = await this.save(user);
    this.logger.log(`usuario_creado userId=${saved.id}`);
    return this.toResponse(saved);
  }

  async findAll({ page, limit }: PaginationQueryDto): Promise<UserListResponseDto> {
    const [users, total] = await this.users.findAndCount({
      order: { fechaCreacion: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: users.map((user) => this.toResponse(user)), page, limit, total };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.users.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, ...data } = dto;
    Object.assign(user, data);
    if (password !== undefined) {
      user.passwordHash = await hashPassword(password);
    }

    const saved = await this.save(user);
    // Solo los nombres de los campos: los valores pueden ser datos personales o la contrasena.
    this.logger.log(
      `usuario_actualizado userId=${saved.id} campos=${Object.keys(dto).join(',')}`,
    );
    return this.toResponse(saved);
  }

  private async save(user: User): Promise<User> {
    try {
      return await this.users.save(user);
    } catch (error) {
      const message = CONFLICT_MESSAGES[uniqueViolationConstraint(error) ?? ''];
      if (message) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  // Lista explicita de campos: password_hash nunca puede salir por descuido.
  private toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      cedula: user.cedula,
      nombres: user.nombres,
      apellidos: user.apellidos,
      fechaNacimiento: user.fechaNacimiento,
      username: user.username,
      email: user.email,
      estado: user.estado,
      fechaCreacion: user.fechaCreacion,
      fechaActualizacion: user.fechaActualizacion,
    };
  }
}
