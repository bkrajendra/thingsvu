import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TenantProvisioningService } from '../../tenancy/tenant-provisioning.service';
import { TenantContext } from '../../tenancy/tenant-context';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service';
import { DevicesService } from '../../devices/devices.service';
import { DeviceCredentialsService } from '../../devices/device-credentials.service';
import { ControlTenant } from '../models/control/tenant.model';
import { UserProfile } from '../models/tenant/user-profile.model';
import { Device } from '../models/tenant/device.model';

const DEMO_SLUG = 'demo';
const DEMO_ADMIN_EMAIL = 'admin@demo.test';
const DEMO_ADMIN_PASSWORD = 'DemoPass123!';
const DEMO_DEVICE_NAME = 'Demo Sensor';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const provisioning = app.get(TenantProvisioningService);
  const keycloakAdmin = app.get(KeycloakAdminService);
  const devicesService = app.get(DevicesService);
  const credentialsService = app.get(DeviceCredentialsService);

  let tenant = await ControlTenant.findOne({ where: { slug: DEMO_SLUG } });
  if (!tenant) {
    const provisioned = await provisioning.provision({
      slug: DEMO_SLUG,
      name: 'Demo Tenant',
    });
    tenant = await ControlTenant.findByPk(provisioned.id);
  }
  if (!tenant) throw new Error('Failed to provision or find the demo tenant');
  console.log(`Tenant ready: ${tenant.slug} (${tenant.schemaName})`);

  await TenantContext.run(
    { tenantId: tenant.id, schemaName: tenant.schemaName, slug: tenant.slug },
    async () => {
      const ScopedUserProfile = UserProfile.schema(tenant.schemaName);
      let profile = await ScopedUserProfile.findOne({
        where: { email: DEMO_ADMIN_EMAIL },
      });
      if (!profile) {
        const kcUser = await keycloakAdmin.createUser({
          email: DEMO_ADMIN_EMAIL,
          tenantId: tenant.id,
          temporaryPassword: DEMO_ADMIN_PASSWORD,
        });
        await keycloakAdmin.assignRealmRole(kcUser.id, 'tenant_admin');
        profile = await ScopedUserProfile.create({
          keycloakSub: kcUser.id,
          email: DEMO_ADMIN_EMAIL,
          displayName: 'Demo Admin',
          role: 'tenant_admin',
          status: 'active',
        });
        console.log(
          `Created demo tenant_admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD} (temporary — Keycloak will prompt a change on first login)`,
        );
      } else {
        console.log(`Demo tenant_admin already exists: ${DEMO_ADMIN_EMAIL}`);
      }

      const ScopedDevice = Device.schema(tenant.schemaName);
      let device = await ScopedDevice.findOne({
        where: { name: DEMO_DEVICE_NAME },
      });
      if (!device) {
        device = await devicesService.create({ name: DEMO_DEVICE_NAME });
        console.log(`Created demo device: ${device.id}`);
      } else {
        console.log(`Demo device already exists: ${device.id}`);
      }

      const existingCredential = await credentialsService.getMetadata(
        device.id,
      );
      if (!existingCredential) {
        const { token } = await credentialsService.issueAccessToken(device.id);
        console.log(
          '\n--- Demo device access token (shown once, save it now) ---',
        );
        console.log(token);
        console.log('---\n');
      } else {
        console.log(
          'Demo device already has a credential; delete the device row and re-run to reissue a token.',
        );
      }
    },
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
