import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793836800000 implements MigrationInterface {
  name = 'InitialSchema1793836800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "analyses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "filename" character varying(255) NOT NULL,
        "sha256" character varying(64) NOT NULL,
        "technique" character varying(100) NOT NULL,
        "indicators" jsonb NOT NULL,
        "status" character varying(20) NOT NULL,
        "action" character varying(20) NOT NULL,
        "limitations" text,
        "stored_path" character varying(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_analyses_status" CHECK ("status" IN ('sin_indicios', 'sospechoso', 'no_concluyente', 'error')),
        CONSTRAINT "CHK_analyses_action" CHECK ("action" IN ('ninguna', 'advertencia', 'cuarentena', 'rechazo')),
        CONSTRAINT "PK_analyses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_analyses_user" ON "analyses" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "analyses"`);
  }
}
