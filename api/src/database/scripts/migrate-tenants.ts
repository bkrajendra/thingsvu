import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { createSchemaMigrator } from '../schema-migrator';
import { tenantMigrations } from '../migrations/tenant/0001-init';
import { ControlTenant } from '../models/control/tenant.model';

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
  });
  ControlTenant.initModel(sequelize);

  const tenants = await ControlTenant.findAll({ where: { status: 'active' } });
  for (const tenant of tenants) {
    const migrator = createSchemaMigrator(
      sequelize,
      tenant.schemaName,
      tenantMigrations,
    );
    const applied = await migrator.up();
    console.log(
      `${tenant.slug}: applied ${applied.length} migration(s)`,
      applied.map((m) => m.name),
    );
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
