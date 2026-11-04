import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { UserRole } from '../../user-roles/entities/user-role.entity.js';

@Entity({
  name: 'roles',
})
@Index(
  'UQ_roles_rol',
  ['rol'],
  {
    unique: true,
  },
)
export class Role {

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_roles',
  })
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  rol!: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  description!: string | null;

  @Column({
    type: 'boolean',
    default: true,
  })
  estado!: boolean;

  @VersionColumn({
    name: 'version',
  })
  version!: number;

  @CreateDateColumn({
    name: 'fecha_creacion',
    type: 'timestamp',
  })
  fechaCreacion!: Date;

  @UpdateDateColumn({
    name: 'fecha_actualizacion',
    type: 'timestamp',
  })
  fechaActualizacion!: Date;

  @DeleteDateColumn({
    name: 'fecha_eliminacion',
    type: 'timestamp',
    nullable: true,
  })
  fechaEliminacion!: Date | null;

  @OneToMany(
    () => UserRole,
    (userRole) => userRole.role,
  )
  userRoles!: UserRole[];
}