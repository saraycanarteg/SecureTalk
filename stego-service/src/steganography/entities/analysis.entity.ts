import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AnalysisStatus = 'sin_indicios' | 'sospechoso' | 'no_concluyente' | 'error';
export type AnalysisAction = 'ninguna' | 'advertencia' | 'cuarentena' | 'rechazo';

@Entity({
  name: 'analyses',
})
@Check(
  'CHK_analyses_status',
  `"status" IN ('sin_indicios', 'sospechoso', 'no_concluyente', 'error')`,
)
@Check(
  'CHK_analyses_action',
  `"action" IN ('ninguna', 'advertencia', 'cuarentena', 'rechazo')`,
)
@Index(
  'IDX_analyses_user',
  ['userId'],
)
export class Analysis {

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_analyses',
  })
  id!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  filename!: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  sha256!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  technique!: string;

  @Column({
    type: 'jsonb',
  })
  indicators!: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 20,
  })
  status!: AnalysisStatus;

  @Column({
    type: 'varchar',
    length: 20,
  })
  action!: AnalysisAction;

  @Column({
    type: 'text',
    nullable: true,
  })
  limitations!: string | null;

  @Column({
    name: 'stored_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  storedPath!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt!: Date;
}
