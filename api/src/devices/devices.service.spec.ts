import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import { DevicesService } from './devices.service';
import { Device } from '../database/models/tenant/device.model';
import { DeviceProfile } from '../database/models/tenant/device-profile.model';
import { TenantContext } from '../tenancy/tenant-context';

describe('DevicesService', () => {
  let sequelize: Sequelize;
  let service: DevicesService;
  const schema = 'test_devices_schema';

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE "${schema}".device_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        transport text NOT NULL DEFAULT 'http', provision_type text NOT NULL DEFAULT 'access_token',
        telemetry_keys jsonb NOT NULL DEFAULT '[]', default_attributes jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        device_profile_id uuid REFERENCES "${schema}".device_profiles(id),
        label text, status text NOT NULL DEFAULT 'active', last_seen_at timestamptz, firmware_version text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    DeviceProfile.initModel(sequelize);
    Device.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({ providers: [DevicesService] }).compile();
    service = moduleRef.get(DevicesService);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('creates a device scoped to the current tenant schema', async () => {
    const device = await TenantContext.run(
      { tenantId: 't1', schemaName: schema, slug: 'demo' },
      () => service.create({ name: 'Sensor 1' }),
    );
    expect(device.name).toBe('Sensor 1');
    expect(device.status).toBe('active');

    const found = await TenantContext.run(
      { tenantId: 't1', schemaName: schema, slug: 'demo' },
      () => service.findOne(device.id),
    );
    expect(found.id).toBe(device.id);
  });
});
