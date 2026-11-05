import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRole } from '../user-roles/entities/user-role.entity';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
  ) {}

  // Fuente unica de los permisos: se consulta en cada peticion y nunca se guarda ni se lee del JWT.
  // Un usuario o rol inactivo o con soft delete no aporta ningun rol.
  async getActiveRoles(userId: string): Promise<string[]> {
    const rows = await this.userRoles
      .createQueryBuilder('userRole')
      .innerJoin(
        'userRole.user',
        'user',
        'user.estado = true AND user.fechaEliminacion IS NULL',
      )
      .innerJoin(
        'userRole.role',
        'role',
        'role.estado = true AND role.fechaEliminacion IS NULL',
      )
      .select('role.rol', 'rol')
      .where('userRole.userId = :userId', { userId })
      .getRawMany<{ rol: string }>();

    return rows.map((row) => row.rol);
  }
}
