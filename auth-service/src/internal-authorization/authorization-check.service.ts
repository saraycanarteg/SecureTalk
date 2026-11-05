import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AuthorizationService } from '../auth/authorization.service';
import { RevokedTokensService } from '../auth/revoked-tokens.service';
import { TokenClaims, TokenService } from '../auth/token.service';
import { rolesAllowedFor } from './action-permissions';
import { AuthorizationCheckDto, AuthorizationDecisionDto } from './dto/authorization-check.dto';

const MAX_LOGGED_LENGTH = 100;

// JSON.stringify evita inyectar lineas en el log con texto que no controla AUTH.
const forLog = (value: string | null | undefined) =>
  JSON.stringify(value?.slice(0, MAX_LOGGED_LENGTH) ?? null);

@Injectable()
export class AuthorizationCheckService {
  private readonly logger = new Logger(AuthorizationCheckService.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly revokedTokens: RevokedTokensService,
    private readonly authorization: AuthorizationService,
  ) {}

  async check(dto: AuthorizationCheckDto, requestId?: string): Promise<AuthorizationDecisionDto> {
    const { subject_token: token, action, resource_id: resourceId } = dto;
    const context = `accion=${forLog(action)} recurso=${forLog(resourceId)} requestId=${requestId}`;

    let claims: TokenClaims;
    try {
      claims = await this.tokens.verify(token);
    } catch (error) {
      const expiredSubject = this.expiredSubject(error);
      if (expiredSubject) {
        return this.decide(expiredSubject, action, false, 'token_expired', context);
      }
      // Sin una firma valida no se sabe de quien es el token: el contrato pide un error.
      this.logger.warn(
        `autorizacion_sin_decision motivo=${(error as { code?: string }).code ?? 'invalido'} ${context}`,
      );
      throw new BadRequestException('subject_token invalido');
    }

    const { allowed, reason } = await this.evaluate(claims, action);
    return this.decide(claims.sub, action, allowed, reason, context);
  }

  // Cualquier caso no contemplado termina en denegar: solo un rol vigente permite.
  private async evaluate(
    { sub, jti }: TokenClaims,
    action: string,
  ): Promise<{ allowed: boolean; reason: string }> {
    if (await this.revokedTokens.isRevoked(jti)) {
      return { allowed: false, reason: 'token_revoked' };
    }
    if (!(await this.authorization.isUserActive(sub))) {
      return { allowed: false, reason: 'user_inactive' };
    }

    const rolesAllowed = rolesAllowedFor(action);
    if (!rolesAllowed) {
      return { allowed: false, reason: 'unknown_action' };
    }

    const activeRoles = await this.authorization.getActiveRoles(sub);
    return activeRoles.some((role) => rolesAllowed.includes(role))
      ? { allowed: true, reason: 'active_role_grants_permission' }
      : { allowed: false, reason: 'no_active_role_grants_permission' };
  }

  // jose comprueba la firma antes que la expiracion, asi que este sub es confiable.
  private expiredSubject(error: unknown): string | undefined {
    const { code, payload } = error as { code?: string; payload?: { sub?: unknown } };
    return code === 'ERR_JWT_EXPIRED' && typeof payload?.sub === 'string'
      ? payload.sub
      : undefined;
  }

  // Sin el JWT ni la clave de servicio: solo el sujeto, la accion y el resultado.
  private decide(
    subjectId: string,
    action: string,
    allowed: boolean,
    reason: string,
    context: string,
  ): AuthorizationDecisionDto {
    const message = `autorizacion_decision permitido=${allowed} motivo=${reason} userId=${subjectId} ${context}`;
    if (allowed) {
      this.logger.log(message);
    } else {
      this.logger.warn(message);
    }
    return { subject_id: subjectId, action, allowed, reason };
  }
}
