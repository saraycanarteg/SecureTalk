import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { UserRolesModule } from './user-roles/user-roles.module';

@Module({
  imports: [UsersModule, RolesModule, UserRolesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
