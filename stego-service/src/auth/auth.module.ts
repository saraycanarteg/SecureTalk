import { Module } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenVerifier } from './token-verifier.service';

@Module({
  providers: [TokenVerifier, JwtAuthGuard],
  exports: [TokenVerifier, JwtAuthGuard],
})
export class AuthModule {}
