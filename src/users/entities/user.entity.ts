import { Exclude } from 'class-transformer';

import {
  Check,
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
  name: 'users',
})
@Check(
  'CHK_users_cedula',
  `"cedula" ~ '^[0-9]{10}$'`,
)
@Index(
  'UQ_users_cedula',
  ['cedula'],
  {
    unique: true,
  },
)
@Index(
  'UQ_users_username',
  ['username'],
  {
    unique: true,
  },
)
@Index(
  'UQ_users_email',
  ['email'],
  {
    unique: true,
  },
)
export class User {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 10,
  })
  cedula!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  nombres!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  apellidos!: string;

  @Column({
    name: 'fecha_nacimiento',
    type: 'date',
  })
  fechaNacimiento!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  username!: string;

  @Column({
    type: 'varchar',
    length: 150,
  })
  email!: string;

  @Exclude()
  @Column({
    name: 'password',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

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
    (userRole) => userRole.user,
  )
  userRoles!: UserRole[];
}