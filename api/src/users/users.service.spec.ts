import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import { UsersService } from './users.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { UserProfile } from '../database/models/tenant/user-profile.model';
import { TenantContext } from '../tenancy/tenant-context';

describe('UsersService', () => {
  let sequelize: Sequelize;
  let service: UsersService;
  const schema = 'test_users_schema';
  const keycloakAdmin = {
    createUser: jest.fn(),
    assignRealmRole: jest.fn(),
  };

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE "${schema}".user_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_sub text UNIQUE NOT NULL,
        email text NOT NULL,
        display_name text,
        role text NOT NULL DEFAULT 'tenant_user',
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    UserProfile.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: KeycloakAdminService, useValue: keycloakAdmin },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('creates a Keycloak user, assigns the role, and mirrors a user_profile row', async () => {
    keycloakAdmin.createUser.mockResolvedValue({ id: 'kc-sub-1' });
    keycloakAdmin.assignRealmRole.mockResolvedValue(undefined);

    const result = await TenantContext.run(
      { tenantId: 'tenant-1', schemaName: schema, slug: 'demo' },
      () => service.create({ email: 'admin@demo.test', role: 'tenant_admin' }),
    );

    expect(keycloakAdmin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@demo.test',
        tenantId: 'tenant-1',
      }),
    );
    expect(keycloakAdmin.assignRealmRole).toHaveBeenCalledWith(
      'kc-sub-1',
      'tenant_admin',
    );
    expect(result.profile.email).toBe('admin@demo.test');
    expect(result.profile.keycloakSub).toBe('kc-sub-1');
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });
});
