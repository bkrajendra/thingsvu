import { Module } from '@nestjs/common';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [KeycloakModule, TenancyModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
