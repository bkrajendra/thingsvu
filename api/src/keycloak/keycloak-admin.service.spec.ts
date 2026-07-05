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

  it('ensureTenantIdUserProfileAttribute declares tenant_id and is idempotent', async () => {
    await service.ensureTenantIdUserProfileAttribute();
    await expect(
      service.ensureTenantIdUserProfileAttribute(),
    ).resolves.not.toThrow();

    const token = await service.getAdminToken();
    const res = await fetch(`${config.adminBaseUrl}/admin/realms/${config.realm}/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = (await res.json()) as { attributes: Array<{ name: string }> };
    expect(profile.attributes.some((a) => a.name === 'tenant_id')).toBe(true);
  });

  it('setUserEnabled disables and re-enables a user without dropping other fields', async () => {
    const created = await service.createUser({
      email: 'set-enabled-spec@demo.test',
      tenantId: 'spec-tenant-id',
      temporaryPassword: 'SpecPass123!',
    });

    await service.setUserEnabled(created.id, false);
    const token = await service.getAdminToken();
    const disabledRes = await fetch(
      `${config.adminBaseUrl}/admin/realms/${config.realm}/users/${created.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const disabledUser = (await disabledRes.json()) as {
      enabled: boolean;
      email: string;
      attributes?: Record<string, string[]>;
    };
    expect(disabledUser.enabled).toBe(false);
    expect(disabledUser.email).toBe('set-enabled-spec@demo.test');

    await service.setUserEnabled(created.id, true);
    const enabledRes = await fetch(
      `${config.adminBaseUrl}/admin/realms/${config.realm}/users/${created.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const enabledUser = (await enabledRes.json()) as { enabled: boolean };
    expect(enabledUser.enabled).toBe(true);
  });

  it('ensureRealmRolesInIdToken enables id.token.claim on the realm-role mapper and is idempotent', async () => {
    await service.ensureRealmRolesInIdToken();
    await expect(service.ensureRealmRolesInIdToken()).resolves.not.toThrow();

    const token = await service.getAdminToken();
    const scopesRes = await fetch(
      `${config.adminBaseUrl}/admin/realms/${config.realm}/client-scopes`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const scopes = (await scopesRes.json()) as Array<{ id: string; name: string }>;
    const rolesScope = scopes.find((s) => s.name === 'roles')!;
    const mappersRes = await fetch(
      `${config.adminBaseUrl}/admin/realms/${config.realm}/client-scopes/${rolesScope.id}/protocol-mappers/models`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const mappers = (await mappersRes.json()) as Array<{
      protocolMapper: string;
      config: Record<string, string>;
    }>;
    const realmRoleMapper = mappers.find(
      (m) => m.protocolMapper === 'oidc-usermodel-realm-role-mapper',
    )!;
    expect(realmRoleMapper.config['id.token.claim']).toBe('true');
  });
});
