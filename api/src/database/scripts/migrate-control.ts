import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { createSchemaMigrator } from '../schema-migrator';
import { controlMigrations } from '../migrations/control/0001-init';

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
  const migrator = createSchemaMigrator(
    sequelize,
    'control',
    controlMigrations,
  );
  const applied = await migrator.up();
  console.log(
    `Applied ${applied.length} control migration(s):`,
    applied.map((m) => m.name),
  );
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
