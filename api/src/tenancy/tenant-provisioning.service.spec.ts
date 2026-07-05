import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ControlTenant } from '../database/models/control/tenant.model';

describe('TenantProvisioningService', () => {
  let sequelize: Sequelize;
  let service: TenantProvisioningService;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS control.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL,
        name text NOT NULL,
        schema_name text UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'provisioning',
        keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    ControlTenant.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: getConnectionToken(), useValue: sequelize },
      ],
    }).compile();
    service = moduleRef.get(TenantProvisioningService);
  });

  afterEach(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS tenant_provtest CASCADE`);
    await sequelize.query(
      `DELETE FROM control.tenants WHERE slug = 'provtest'`,
    );
  });

  afterAll(async () => {
    await sequelize.query('DROP SCHEMA IF EXISTS control CASCADE');
    await sequelize.close();
  });

  it('creates the schema, applies tenant migrations, and marks the tenant active', async () => {
    const result = await service.provision({
      slug: 'provtest',
      name: 'Prov Test',
    });

    expect(result.status).toBe('active');
    expect(result.schemaName).toBe('tenant_provtest');

    const [[{ exists }]] = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'tenant_provtest' AND table_name = 'devices')`,
    );
    expect(exists).toBe(true);
  });

  it('rejects a duplicate slug without leaving a partial schema behind', async () => {
    await service.provision({ slug: 'provtest', name: 'Prov Test' });
    await expect(
      service.provision({ slug: 'provtest', name: 'Prov Test Again' }),
    ).rejects.toThrow();

    const [rows] = await sequelize.query(
      `SELECT count(*)::int AS count FROM control.tenants WHERE slug = 'provtest'`,
    );
    expect((rows as Array<{ count: number }>)[0].count).toBe(1);
  });
});
