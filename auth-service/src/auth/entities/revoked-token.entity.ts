import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'revoked_tokens',
})
@Index(
  'IDX_revoked_tokens_expires_at',
  ['expiresAt'],
)
export class RevokedToken {

  // Solo el jti: la tabla nunca guarda el JWT.
  @PrimaryColumn({
    type: 'varchar',
    length: 255,
    primaryKeyConstraintName: 'PK_revoked_tokens',
  })
  jti!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId!: string;

  // Desde esta fecha el JWT ya no es valido por si mismo y la fila se puede eliminar.
  @Column({
    name: 'expires_at',
    type: 'timestamptz',
  })
  expiresAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  revokedAt!: Date;
}
