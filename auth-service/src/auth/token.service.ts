import { createPrivateKey, createPublicKey, KeyObject, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

import type { Env } from '../config/env.schema.js';

const ALGORITHM = 'EdDSA';

export interface TokenClaims {
  sub: string;
  jti: string;
  exp: number;
}

@Injectable()
export class TokenService implements OnModuleInit {
  private privateKey: KeyObject;
  private publicKey: KeyObject;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    this.privateKey = createPrivateKey(
      readFileSync(this.config.get('JWT_PRIVATE_KEY_PATH', { infer: true })),
    );
    this.publicKey = createPublicKey(
      readFileSync(this.config.get('JWT_PUBLIC_KEY_PATH', { infer: true })),
    );

    if (
      this.privateKey.asymmetricKeyType !== 'ed25519' ||
      this.publicKey.asymmetricKeyType !== 'ed25519'
    ) {
      throw new Error('Las llaves JWT deben ser Ed25519');
    }
  }

  get expiresInSeconds(): number {
    return this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true });
  }

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.config.get('JWT_ISSUER', { infer: true }))
      .setAudience(this.config.get('JWT_AUDIENCE', { infer: true }))
      .setIssuedAt()
      .setExpirationTime(`${this.expiresInSeconds}s`)
      .setJti(randomUUID())
      .sign(this.privateKey);
  }

  // Solo acepta EdDSA: un token con otro algoritmo se rechaza antes de verificar la firma.
  async verify(token: string): Promise<TokenClaims> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: [ALGORITHM],
      issuer: this.config.get('JWT_ISSUER', { infer: true }),
      audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      requiredClaims: ['sub', 'iat', 'exp', 'jti'],
    });
    return { sub: payload.sub as string, jti: payload.jti as string, exp: payload.exp as number };
  }
}
