import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RevokedToken } from './entities/revoked-token.entity';
import { TokenClaims } from './token.service';

@Injectable()
export class RevokedTokensService {
  constructor(
    @InjectRepository(RevokedToken)
    private readonly revokedTokens: Repository<RevokedToken>,
  ) {}

  // Idempotente: dos logouts simultaneos del mismo token no generan un error.
  // Aprovecha para limpiar los que ya vencieron, que no hace falta seguir recordando.
  async revoke({ jti, sub, exp }: TokenClaims): Promise<void> {
    await this.revokedTokens.query(
      `
      INSERT INTO "revoked_tokens" ("jti", "user_id", "expires_at")
      VALUES ($1, $2, to_timestamp($3))
      ON CONFLICT ("jti") DO NOTHING
      `,
      [jti, sub, exp],
    );
    await this.revokedTokens.query(`DELETE FROM "revoked_tokens" WHERE "expires_at" < now()`);
  }

  isRevoked(jti: string): Promise<boolean> {
    return this.revokedTokens.existsBy({ jti });
  }
}
