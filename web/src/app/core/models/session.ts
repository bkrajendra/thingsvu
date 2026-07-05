export interface SessionUser {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
}

export interface MeResponse {
  user: SessionUser;
}
