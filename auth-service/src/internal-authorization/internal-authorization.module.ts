import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationCheckService } from './authorization-check.service';
import { InternalAuthorizationController } from './internal-authorization.controller';
import { ServiceKeyGuard } from './service-key.guard';

@Module({
  imports: [AuthModule],
  controllers: [InternalAuthorizationController],
  providers: [AuthorizationCheckService, ServiceKeyGuard],
})
export class InternalAuthorizationModule {}
