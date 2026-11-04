import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from '../../users/entities/user.entity.js';
import { Role } from '../../roles/entities/role.entity.js';

@Entity({
  name: 'user_roles',
})
@Unique(
  'UQ_user_roles_user_role',
  ['userId', 'roleId'],
)
@Index(
  'IDX_user_roles_user',
  ['userId'],
)
@Index(
  'IDX_user_roles_role',
  ['roleId'],
)
export class UserRole {

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_user_roles',
  })
  id!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId!: string;

  @Column({
    name: 'role_id',
    type: 'uuid',
  })
  roleId!: string;

  @ManyToOne(
    () => User,
    (user) => user.userRoles,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_user_roles_user',
  })
  user!: User;

  @ManyToOne(
    () => Role,
    (role) => role.userRoles,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'role_id',
    foreignKeyConstraintName: 'FK_user_roles_role',
  })
  role!: Role;

  @CreateDateColumn({
    name: 'assigned_at',
    type: 'timestamp',
  })
  assignedAt!: Date;
}