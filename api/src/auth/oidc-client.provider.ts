import { Issuer, type Client } from 'openid-client';
import { ConfigService } from '@nestjs/config';

export const OIDC_CLIENT = 'OIDC_CLIENT';

export async function createOidcClient(config: ConfigService): Promise<Client> {
  const issuer = await Issuer.discover(config.get<string>('KEYCLOAK_ISSUER')!);
  return new issuer.Client({
    client_id: config.get<string>('KEYCLOAK_CLIENT_ID')!,
    client_secret: config.get<string>('KEYCLOAK_CLIENT_SECRET')!,
    redirect_uris: [
      `${config.get<string>('APP_BASE_URL')}/api/v1/auth/callback`,
    ],
    response_types: ['code'],
  });
}
