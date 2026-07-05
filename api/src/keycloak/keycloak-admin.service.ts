export interface KeycloakAdminConfig {
  adminBaseUrl: string;
  adminUsername: string;
  adminPassword: string;
  realm: string;
  clientId: string;
}

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakGroup {
  id: string;
  name: string;
}

export class KeycloakAdminService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: KeycloakAdminConfig) {}

  async getAdminToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const res = await fetch(
      `${this.config.adminBaseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: this.config.adminUsername,
          password: this.config.adminPassword,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Failed to obtain Keycloak admin token: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in - 10) * 1000,
    };
    return body.access_token;
  }

  private async adminFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getAdminToken();
    return fetch(
      `${this.config.adminBaseUrl}/admin/realms/${this.config.realm}${path}`,
      {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  async ensureRealmRole(name: string): Promise<KeycloakRole> {
    const existing = await this.adminFetch(
      `/roles/${encodeURIComponent(name)}`,
    );
    if (existing.ok) {
      return (await existing.json()) as KeycloakRole;
    }
    const created = await this.adminFetch('/roles', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(
        `Failed to create role ${name}: ${created.status} ${await created.text()}`,
      );
    }
    const fetched = await this.adminFetch(`/roles/${encodeURIComponent(name)}`);
    if (!fetched.ok) {
      throw new Error(
        `Failed to fetch role ${name} after creation: ${fetched.status} ${await fetched.text()}`,
      );
    }
    return (await fetched.json()) as KeycloakRole;
  }

  async ensureTenantGroup(slug: string): Promise<KeycloakGroup> {
    const groupName = `tenant_${slug}`;
    const found = await this.adminFetch(
      `/groups?search=${encodeURIComponent(groupName)}&exact=true`,
    );
    if (!found.ok) {
      throw new Error(
        `Failed to search for group ${groupName}: ${found.status} ${await found.text()}`,
      );
    }
    const foundGroups = (await found.json()) as KeycloakGroup[];
    const existing = foundGroups.find((g) => g.name === groupName);
    if (existing) return existing;

    const created = await this.adminFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ name: groupName }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(
        `Failed to create group ${groupName}: ${created.status} ${await created.text()}`,
      );
    }
    const refetched = await this.adminFetch(
      `/groups?search=${encodeURIComponent(groupName)}&exact=true`,
    );
    if (!refetched.ok) {
      throw new Error(
        `Failed to re-fetch group ${groupName} after creation: ${refetched.status} ${await refetched.text()}`,
      );
    }
    const refetchedGroups = (await refetched.json()) as KeycloakGroup[];
    const group = refetchedGroups.find((g) => g.name === groupName);
    if (!group) throw new Error(`Group ${groupName} not found after creation`);
    return group;
  }

  private async getClientInternalId(): Promise<string> {
    const res = await this.adminFetch(
      `/clients?clientId=${encodeURIComponent(this.config.clientId)}`,
    );
    if (!res.ok) {
      throw new Error(
        `Failed to look up client ${this.config.clientId}: ${res.status} ${await res.text()}`,
      );
    }
    const clients = (await res.json()) as Array<{ id: string }>;
    if (!clients.length)
      throw new Error(
        `Client ${this.config.clientId} not found in realm ${this.config.realm}`,
      );
    return clients[0].id;
  }

  async ensureUserAttributeMapper(): Promise<void> {
    const clientInternalId = await this.getClientInternalId();
    const res = await this.adminFetch(
      `/clients/${clientInternalId}/protocol-mappers/models`,
    );
    if (!res.ok) {
      throw new Error(
        `Failed to list protocol mappers for client ${this.config.clientId}: ${res.status} ${await res.text()}`,
      );
    }
    const mappers = (await res.json()) as Array<{ name: string }>;
    if (mappers.some((m) => m.name === 'tenant_id')) return;

    const created = await this.adminFetch(
      `/clients/${clientInternalId}/protocol-mappers/models`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'tenant_id',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-usermodel-attribute-mapper',
          config: {
            'user.attribute': 'tenant_id',
            'claim.name': 'tenant_id',
            'jsonType.label': 'String',
            'id.token.claim': 'true',
            'access.token.claim': 'true',
            'userinfo.token.claim': 'true',
          },
        }),
      },
    );
    if (!created.ok) {
      throw new Error(
        `Failed to create tenant_id mapper: ${created.status} ${await created.text()}`,
      );
    }
  }

  async createUser(input: {
    email: string;
    tenantId: string;
    temporaryPassword: string;
  }): Promise<{ id: string }> {
    const created = await this.adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        enabled: true,
        emailVerified: true,
        attributes: { tenant_id: [input.tenantId] },
        credentials: [
          { type: 'password', value: input.temporaryPassword, temporary: true },
        ],
      }),
    });
    if (!created.ok) {
      throw new Error(
        `Failed to create user ${input.email}: ${created.status} ${await created.text()}`,
      );
    }
    const location = created.headers.get('Location');
    const id = location?.split('/').pop();
    if (!id)
      throw new Error(
        'Keycloak did not return a Location header for the created user',
      );
    return { id };
  }

  async assignRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.ensureRealmRole(roleName);
    const res = await this.adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to assign role ${roleName} to user ${userId}: ${res.status} ${await res.text()}`,
      );
    }
  }

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const res = await this.adminFetch(`/users/${userId}/groups/${groupId}`, {
      method: 'PUT',
    });
    if (!res.ok) {
      throw new Error(
        `Failed to add user ${userId} to group ${groupId}: ${res.status} ${await res.text()}`,
      );
    }
  }
}
