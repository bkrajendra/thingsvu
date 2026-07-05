import { Injectable } from '@nestjs/common';
import { generators, type Client, type TokenSet } from 'openid-client';
import type { SessionUser } from './session.types';

@Injectable()
export class AuthService {
  buildAuthorizationRequest(client: Client) {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return { url, codeVerifier, state };
  }

  async exchangeCode(
    client: Client,
    params: { code: string; state: string },
    stored: { codeVerifier: string; state: string },
  ): Promise<TokenSet> {
    if (params.state !== stored.state) {
      throw new Error('OAuth state mismatch');
    }
    return client.callback(
      client.metadata.redirect_uris![0],
      { code: params.code, state: params.state },
      { code_verifier: stored.codeVerifier, state: stored.state },
    );
  }

  toSessionUser(tokenSet: TokenSet): SessionUser {
    const claims = tokenSet.claims();
    const realmAccess =
      (claims['realm_access'] as { roles?: string[] } | undefined) ?? {};
    return {
      sub: claims.sub,
      email: (claims.email as string) ?? '',
      tenantId: (claims['tenant_id'] as string) ?? '',
      roles: realmAccess.roles ?? [],
    };
  }
}
