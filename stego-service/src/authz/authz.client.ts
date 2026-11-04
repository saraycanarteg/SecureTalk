import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { Env } from '../config/env.schema.js';

export type AuthzAction = 'steganography.analyze' | 'steganography.results.read';

export interface AuthzRequest {
  subjectId: string;
  subjectToken: string;
  action: AuthzAction;
  resourceId: string | null;
  requestId?: string;
}

const CHECK_PATH = '/internal/authorization/check';

// Anexo B. z.boolean() es estricto: "true" o 1 no cuentan como una decision valida.
const decisionSchema = z.object({
  subject_id: z.string(),
  action: z.string(),
  allowed: z.boolean(),
  reason: z.string().max(200),
});

@Injectable()
export class AuthzClient implements OnModuleInit {
  private readonly logger = new Logger(AuthzClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    if (this.config.get('AUTHZ_MODE', { infer: true }) === 'mock') {
      this.logger.warn(
        'AUTHZ_MODE=mock: toda operacion con un JWT valido se permite sin consultar a AUTH. Solo para desarrollo.',
      );
    }
  }

  // Devuelve la decision de AUTH. Sin una decision verificable lanza 503: nunca permite por defecto.
  async isAllowed(request: AuthzRequest): Promise<boolean> {
    if (this.config.get('AUTHZ_MODE', { infer: true }) === 'mock') {
      this.logDecision(request, true, 'authz_mock');
      return true;
    }

    const decision = await this.requestDecision(request);
    this.logDecision(request, decision.allowed, decision.reason);
    return decision.allowed;
  }

  private async requestDecision(request: AuthzRequest) {
    let body: unknown;
    try {
      // redirect: 'error' evita enviar la clave de servicio a otro destino.
      const response = await fetch(
        new URL(CHECK_PATH, this.config.get('AUTH_BASE_URL', { infer: true })),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.get('AUTH_TIMEOUT_MS', { infer: true })),
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Key': this.config.get('STEGO_SERVICE_KEY', { infer: true }),
          },
          body: JSON.stringify({
            subject_token: request.subjectToken,
            action: request.action,
            resource_id: request.resourceId,
          }),
        },
      );

      if (response.status !== 200) {
        this.fail(request, `http_${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.fail(request, (error as Error).name);
    }

    const decision = decisionSchema.safeParse(body);
    if (!decision.success) {
      this.fail(request, 'respuesta_invalida');
    }
    if (
      decision.data.subject_id !== request.subjectId ||
      decision.data.action !== request.action
    ) {
      this.fail(request, 'respuesta_no_coincide');
    }
    return decision.data;
  }

  private fail(request: AuthzRequest, reason: string): never {
    this.logger.error(
      `authz_no_disponible motivo=${reason} accion=${request.action} userId=${request.subjectId} requestId=${request.requestId}`,
    );
    throw new ServiceUnavailableException();
  }

  private logDecision(request: AuthzRequest, allowed: boolean, reason: string) {
    // JSON.stringify evita inyectar lineas en el log con el texto que devuelve AUTH.
    this.logger.log(
      `authz_decision permitido=${allowed} motivo=${JSON.stringify(reason)} accion=${request.action} recurso=${request.resourceId} userId=${request.subjectId} requestId=${request.requestId}`,
    );
  }
}
