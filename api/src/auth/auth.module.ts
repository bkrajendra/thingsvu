import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OIDC_CLIENT, createOidcClient } from './oidc-client.provider';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OIDC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createOidcClient(config),
    },
  ],
  exports: [OIDC_CLIENT],
})
export class AuthModule {}
