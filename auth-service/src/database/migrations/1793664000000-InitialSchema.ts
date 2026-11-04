import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793664000000 implements MigrationInterface {
  name = 'InitialSchema1793664000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cedula" character varying(10) NOT NULL,
        "nombres" character varying(100) NOT NULL,
        "apellidos" character varying(100) NOT NULL,
        "fecha_nacimiento" date NOT NULL,
        "username" character varying(50) NOT NULL,
        "email" character varying(150) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "estado" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_eliminacion" TIMESTAMP,
        CONSTRAINT "CHK_users_cedula" CHECK ("cedula" ~ '^[0-9]{10}$'),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_cedula" ON "users" ("cedula")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_username" ON "users" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "rol" character varying(50) NOT NULL,
        "description" character varying(255),
        "estado" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_eliminacion" TIMESTAMP,
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_roles_rol" ON "roles" ("rol")`);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "assigned_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_roles_user_role" UNIQUE ("user_id", "role_id"),
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_roles_user" ON "user_roles" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_roles_role" ON "user_roles" ("role_id")`);
    await queryRunner.query(`
      ALTER TABLE "user_roles" ADD CONSTRAINT "FK_user_roles_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "user_roles" ADD CONSTRAINT "FK_user_roles_role"
      FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
