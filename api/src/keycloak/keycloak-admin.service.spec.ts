import { KeycloakAdminService } from './keycloak-admin.service';

// These tests hit a real, running Keycloak instance over HTTP. The first
// fetch() call in a fresh Node/Jest worker pays a one-time connection setup
// cost that can exceed Jest's default 5000ms test timeout even though the
// Keycloak server itself responds in well under a second (verified via
// curl). Subsequent calls are fast. Raise the timeout for this suite only.
jest.setTimeout(30000);

const config = {
  adminBaseUrl: process.env.KEYCLOAK_ADMIN_BASE_URL ?? 'http://localhost:8081',
  adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'adminpassword',
  realm: process.env.KEYCLOAK_REALM ?? 'thingsvu',
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'thingsvu',
};

describe('KeycloakAdminService', () => {
  const service = new KeycloakAdminService(config);

  it('obtains an admin access token from the master realm', async () => {
    const token = await service.getAdminToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  it('ensureRealmRole is idempotent', async () => {
    await service.ensureRealmRole('tenant_user_test_role');
    await expect(
      service.ensureRealmRole('tenant_user_test_role'),
    ).resolves.not.toThrow();
  });

  it('ensureTenantGroup creates a group and returns its id on repeat calls', async () => {
    const first = await service.ensureTenantGroup('spec_test_tenant');
    const second = await service.ensureTenantGroup('spec_test_tenant');
    expect(first.id).toEqual(second.id);
  });
});
