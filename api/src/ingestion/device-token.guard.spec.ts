import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize';
import { DeviceTokenGuard } from './device-token.guard';
import { ControlTenant } from '../database/models/control/tenant.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { hashDeviceToken } from '../common/device-token.util';

function contextWithToken(token?: string): ExecutionContext {
  const req: any = { headers: token ? { 'x-device-token': token } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('DeviceTokenGuard', () => {
  let sequelize: Sequelize;
  const secret = 'guard-test-secret';
  const config = { get: () => secret } as unknown as ConfigService;
  const guard = new DeviceTokenGuard(config);
  let tenantId: string;
  let deviceId: string;
  let validToken: string;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
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
    `);
    ControlTenant.initModel(sequelize);
    ControlDeviceTokenIndex.initModel(sequelize);

    const tenant = await ControlTenant.create({ slug: 'guardtest', name: 'Guard Test', schemaName: 'tenant_guardtest', status: 'active' });
    tenantId = tenant.id;
    deviceId = '11111111-1111-1111-1111-111111111111';
    validToken = 'plaintext-device-token';
    await ControlDeviceTokenIndex.create({
      tokenHash: hashDeviceToken(validToken, secret),
      tenantId,
      deviceId,
      credentialType: 'access_token',
    });
  });

  afterAll(async () => {
    // NOTE: `control` is a shared schema, not a per-test fixture -- other spec files
    // (device-credentials.service.spec.ts, tenant-provisioning.service.spec.ts) also
    // read/write it concurrently, since Jest runs spec files in parallel worker
    // processes by default. Dropping the whole `control` schema here (as the plan's
    // original brief did) would race with those suites and intermittently break them.
    // Only remove the rows this suite created, scoped by tenantId.
    await sequelize.query(`DELETE FROM control.device_token_index WHERE tenant_id = '${tenantId}'`);
    await sequelize.query(`DELETE FROM control.tenants WHERE id = '${tenantId}'`);
    await sequelize.close();
  });

  it('rejects a request with no token header', async () => {
    await expect(guard.canActivate(contextWithToken())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown token', async () => {
    await expect(guard.canActivate(contextWithToken('not-a-real-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches deviceAuth to the request', async () => {
    const ctx = contextWithToken(validToken);
    const req = (ctx.switchToHttp().getRequest as () => any)();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect(req.deviceAuth).toEqual({ tenantId, deviceId, schemaName: 'tenant_guardtest' });
  });
});
