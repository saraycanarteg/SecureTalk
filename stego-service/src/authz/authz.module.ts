import { Module } from '@nestjs/common';

import { AuthzClient } from './authz.client';
import { AuthzGuard } from './authz.guard';

@Module({
  providers: [AuthzClient, AuthzGuard],
  exports: [AuthzClient, AuthzGuard],
})
export class AuthzModule {}
