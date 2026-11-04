import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'login_attempts',
})
export class LoginAttempt {

  // SHA-256 del identificador: la tabla no conserva lo que se escribio en el login.
  @PrimaryColumn({
    name: 'identifier_hash',
    type: 'varchar',
    length: 64,
    primaryKeyConstraintName: 'PK_login_attempts',
  })
  identifierHash!: string;

  @Column({
    name: 'failed_count',
    type: 'integer',
    default: 0,
  })
  failedCount!: number;

  @Column({
    name: 'window_started_at',
    type: 'timestamp',
    default: () => 'now()',
  })
  windowStartedAt!: Date;
}
