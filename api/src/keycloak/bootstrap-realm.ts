import 'dotenv/config';
import { KeycloakAdminService } from './keycloak-admin.service';

async function main() {
  const service = new KeycloakAdminService({
    adminBaseUrl: process.env.KEYCLOAK_ADMIN_BASE_URL!,
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME!,
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD!,
    realm: process.env.KEYCLOAK_REALM!,
    clientId: process.env.KEYCLOAK_CLIENT_ID!,
  });

  for (const role of ['platform_admin', 'tenant_admin', 'tenant_user']) {
    await service.ensureRealmRole(role);
    console.log(`role ensured: ${role}`);
  }

  await service.ensureUserAttributeMapper();
  console.log(
    'tenant_id protocol mapper ensured on client',
    process.env.KEYCLOAK_CLIENT_ID,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
