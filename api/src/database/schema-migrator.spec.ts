import { Sequelize } from 'sequelize';
import { createSchemaMigrator, SchemaMigration } from './schema-migrator';

describe('createSchemaMigrator', () => {
  let sequelize: Sequelize;
  const schema = 'test_migrator_schema';

  const migrations: SchemaMigration[] = [
    {
      name: '0001-create-widgets',
      up: (s) => `CREATE TABLE "${s}".widgets (id serial PRIMARY KEY)`,
      down: (s) => `DROP TABLE "${s}".widgets`,
    },
  ];

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/iot_platform',
      {
        logging: false,
      },
    );
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('applies pending migrations and records them', async () => {
    const migrator = createSchemaMigrator(sequelize, schema, migrations);
    const applied = await migrator.up();
    expect(applied.map((m) => m.name)).toEqual(['0001-create-widgets']);

    const [[{ exists }]] = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = 'widgets')`,
    );
    expect(exists).toBe(true);
  });

  it('is idempotent on a second run', async () => {
    const migrator = createSchemaMigrator(sequelize, schema, migrations);
    const applied = await migrator.up();
    expect(applied).toEqual([]);
  });
});
