import 'express-session';

export interface SessionUser {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    pkceVerifier?: string;
    oauthState?: string;
  }
}
