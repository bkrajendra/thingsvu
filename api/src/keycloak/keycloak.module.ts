import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KeycloakAdminService } from './keycloak-admin.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KeycloakAdminService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new KeycloakAdminService({
          adminBaseUrl: config.get<string>('KEYCLOAK_ADMIN_BASE_URL')!,
          adminUsername: config.get<string>('KEYCLOAK_ADMIN_USERNAME')!,
          adminPassword: config.get<string>('KEYCLOAK_ADMIN_PASSWORD')!,
          realm: config.get<string>('KEYCLOAK_REALM')!,
          clientId: config.get<string>('KEYCLOAK_CLIENT_ID')!,
        }),
    },
  ],
  exports: [KeycloakAdminService],
})
export class KeycloakModule {}
