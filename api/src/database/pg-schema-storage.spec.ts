import { Sequelize } from 'sequelize';
import { PgSchemaStorage } from './pg-schema-storage';

describe('PgSchemaStorage', () => {
  let sequelize: Sequelize;
  const schema = 'test_storage_schema';

  beforeAll(async () => {
    sequelize = new Sequelize(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform', {
      logging: false,
    });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('reports nothing executed before any migration is logged', async () => {
    const storage = new PgSchemaStorage(sequelize, schema);
    expect(await storage.executed()).toEqual([]);
  });

  it('logs and then reports a migration as executed', async () => {
    const storage = new PgSchemaStorage(sequelize, schema);
    await storage.logMigration({ name: '0001-init' });
    expect(await storage.executed()).toEqual(['0001-init']);
  });

  it('unlogs a migration', async () => {
    const storage = new PgSchemaStorage(sequelize, schema);
    await storage.logMigration({ name: '0002-second' });
    await storage.unlogMigration({ name: '0002-second' });
    expect(await storage.executed()).toEqual(['0001-init']);
  });
});
