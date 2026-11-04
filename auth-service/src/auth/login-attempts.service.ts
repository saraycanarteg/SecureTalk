import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LoginAttempt } from './entities/login-attempt.entity';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW = `interval '15 minutes'`;

export function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class LoginAttemptsService {
  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
  ) {}

  // Reserva el intento antes de verificar la contrasena: al ser una sola sentencia
  // atomica, varias peticiones simultaneas no pueden superar el limite.
  async consume(identifierHash: string): Promise<boolean> {
    const rows: { failed_count: number }[] = await this.attempts.query(
      `
      INSERT INTO "login_attempts" ("identifier_hash", "failed_count", "window_started_at")
      VALUES ($1, 1, now())
      ON CONFLICT ("identifier_hash") DO UPDATE SET
        "failed_count" = CASE
          WHEN "login_attempts"."window_started_at" <= now() - ${WINDOW} THEN 1
          ELSE "login_attempts"."failed_count" + 1
        END,
        "window_started_at" = CASE
          WHEN "login_attempts"."window_started_at" <= now() - ${WINDOW} THEN now()
          ELSE "login_attempts"."window_started_at"
        END
      RETURNING "failed_count"
      `,
      [identifierHash],
    );
    return rows[0].failed_count <= MAX_FAILED_ATTEMPTS;
  }

  // Tras un login exitoso reinicia el contador y limpia las ventanas ya vencidas.
  async reset(identifierHash: string): Promise<void> {
    await this.attempts.query(
      `
      DELETE FROM "login_attempts"
      WHERE "identifier_hash" = $1 OR "window_started_at" <= now() - ${WINDOW}
      `,
      [identifierHash],
    );
  }
}
