import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { DeviceCredentialsService } from './device-credentials.service';
import { DevicesService } from './devices.service';
import { Device } from '../database/models/tenant/device.model';
import { DeviceCredential } from '../database/models/tenant/device-credential.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantContext } from '../tenancy/tenant-context';
import { hashDeviceToken } from '../common/device-token.util';

describe('DeviceCredentialsService', () => {
  let sequelize: Sequelize;
  let service: DeviceCredentialsService;
  const schema = 'test_credentials_schema';
  const secret = 'test-pepper';
  let tenantId: string;
  let deviceId: string;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS control.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, name text NOT NULL,
        schema_name text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'active', keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS control.device_token_index (
        token_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES control.tenants(id),
        device_id uuid NOT NULL, credential_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, device_profile_id uuid,
        label text, status text NOT NULL DEFAULT 'active', last_seen_at timestamptz, firmware_version text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".device_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid UNIQUE NOT NULL REFERENCES "${schema}".devices(id),
        credential_type text NOT NULL, token_hash text UNIQUE, mqtt_username text, mqtt_password_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    ControlTenant.initModel(sequelize);
    ControlDeviceTokenIndex.initModel(sequelize);
    Device.initModel(sequelize);
    DeviceCredential.initModel(sequelize);

    const tenant = await ControlTenant.create({
      slug: 'credtest',
      name: 'Cred Test',
      schemaName: schema,
      status: 'active',
    });
    tenantId = tenant.id;
    const device = await Device.schema(schema).create({
      name: 'Sensor',
      status: 'active',
    });
    deviceId = device.id;

    const config = {
      get: (key: string) =>
        key === 'DEVICE_TOKEN_HASH_SECRET' ? secret : undefined,
    } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceCredentialsService,
        {
          provide: DevicesService,
          useValue: { findOne: jest.fn().mockResolvedValue({ id: deviceId }) },
        },
        { provide: ConfigService, useValue: config },
        { provide: getConnectionToken(), useValue: sequelize },
      ],
    }).compile();
    service = moduleRef.get(DeviceCredentialsService);
  });

  afterAll(async () => {
    // NOTE: `control` is a single shared schema, not a per-test fixture -- other spec
    // files (e.g. tenant-provisioning.service.spec.ts) also read/write it, and Jest runs
    // spec files concurrently across worker processes by default. Dropping the whole
    // `control` schema here would race with those other suites and intermittently break
    // them. Only remove the rows this suite created, scoped by tenantId/deviceId.
    await sequelize.query(
      `DELETE FROM control.device_token_index WHERE device_id = '${deviceId}'`,
    );
    await sequelize.query(
      `DELETE FROM control.tenants WHERE id = '${tenantId}'`,
    );
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('issues a token, stores only its hash, and indexes it in control.device_token_index', async () => {
    const { token, credential } = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );

    expect(credential.get('tokenHash')).toBe(hashDeviceToken(token, secret));
    expect(credential.get('tokenHash')).not.toBe(token);

    const indexRow = await ControlDeviceTokenIndex.findByPk(
      hashDeviceToken(token, secret),
    );
    expect(indexRow?.get('deviceId')).toBe(deviceId);
    expect(indexRow?.get('tenantId')).toBe(tenantId);
  });

  it('rotating the token removes the old index entry', async () => {
    const first = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );
    const second = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );

    const oldIndexRow = await ControlDeviceTokenIndex.findByPk(
      hashDeviceToken(first.token, secret),
    );
    const newIndexRow = await ControlDeviceTokenIndex.findByPk(
      hashDeviceToken(second.token, secret),
    );
    expect(oldIndexRow).toBeNull();
    expect(newIndexRow?.get('deviceId')).toBe(deviceId);
  });
});
