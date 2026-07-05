import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import Redis from 'ioredis';
import { TenantsService } from './tenants.service';
import { TenantProvisioningService } from '../tenancy/tenant-provisioning.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ControlTenant } from '../database/models/control/tenant.model';

describe('TenantsService', () => {
  let sequelize: Sequelize;
  let redis: Redis;
  let service: TenantsService;

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

    redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TenantProvisioningService, useValue: {} },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(TenantsService);
  });

  afterEach(async () => {
    await sequelize.query(`DELETE FROM control.tenants WHERE slug = 'cachetest'`);
    await redis.del('tenant:cachetest');
  });

  afterAll(async () => {
    await sequelize.query('DROP SCHEMA IF EXISTS control CASCADE');
    await sequelize.close();
    redis.disconnect();
  });

  it('evicts the tenant-resolution cache entry when a tenant is updated', async () => {
    const tenant = await ControlTenant.create({
      slug: 'cachetest',
      name: 'Cache Test',
      schemaName: 'tenant_cachetest',
      status: 'active',
    });
    await redis.set(
      'tenant:cachetest',
      JSON.stringify({ id: tenant.id, schemaName: tenant.schemaName, status: 'active' }),
      'EX',
      60,
    );

    await service.update(tenant.id, { status: 'suspended' });

    expect(await redis.get('tenant:cachetest')).toBeNull();
  });
});
