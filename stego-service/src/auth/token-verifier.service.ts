import { createPublicKey, KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';

import type { Env } from '../config/env.schema.js';

export interface TokenClaims {
  sub: string;
  jti: string;
}

@Injectable()
export class TokenVerifier implements OnModuleInit {
  private publicKey: KeyObject;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    this.publicKey = createPublicKey(
      readFileSync(this.config.get('JWT_PUBLIC_KEY_PATH', { infer: true })),
    );

    if (this.publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('La llave publica JWT debe ser Ed25519');
    }
  }

  // Solo acepta EdDSA: "none" o cualquier otro algoritmo se rechaza antes de verificar la firma.
  async verify(token: string): Promise<TokenClaims> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: ['EdDSA'],
      issuer: this.config.get('JWT_ISSUER', { infer: true }),
      audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      requiredClaims: ['sub', 'iat', 'exp', 'jti'],
    });
    return { sub: payload.sub as string, jti: payload.jti as string };
  }
}
