import { MigrationInterface, QueryRunner } from 'typeorm';

export class LoginAttempts1793750400000 implements MigrationInterface {
  name = 'LoginAttempts1793750400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "login_attempts" (
        "identifier_hash" character varying(64) NOT NULL,
        "failed_count" integer NOT NULL DEFAULT 0,
        "window_started_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_attempts" PRIMARY KEY ("identifier_hash")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "login_attempts"`);
  }
}
