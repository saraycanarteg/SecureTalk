import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserRole } from '../user-roles/entities/user-role.entity';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { LoginAttempt } from './entities/login-attempt.entity';
import { LoginAttemptsService } from './login-attempts.service';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, LoginAttempt, UserRole])],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthorizationService,
    LoginAttemptsService,
    TokenService,
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthorizationService, TokenService, AuthGuard, RolesGuard],
})
export class AuthModule {}
