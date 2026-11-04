import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginAttempt } from './entities/login-attempt.entity';
import { LoginAttemptsService } from './login-attempts.service';
import { TokenService } from './token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, LoginAttempt])],
  controllers: [AuthController],
  providers: [AuthService, LoginAttemptsService, TokenService, AuthGuard],
  exports: [TokenService, AuthGuard],
})
export class AuthModule {}
