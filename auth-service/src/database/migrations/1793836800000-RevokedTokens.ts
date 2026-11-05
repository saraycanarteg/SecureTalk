import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevokedTokens1793836800000 implements MigrationInterface {
  name = 'RevokedTokens1793836800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "revoked_tokens" (
        "jti" character varying(255) NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_revoked_tokens" PRIMARY KEY ("jti")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_revoked_tokens_expires_at" ON "revoked_tokens" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "revoked_tokens"`);
  }
}
