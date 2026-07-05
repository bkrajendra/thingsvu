import { Sequelize } from 'sequelize';
import { Umzug } from 'umzug';
import { PgSchemaStorage } from './pg-schema-storage';

export interface SchemaMigration {
  name: string;
  up: (schema: string) => string;
  down?: (schema: string) => string;
}

export function createSchemaMigrator(sequelize: Sequelize, schema: string, migrations: SchemaMigration[]) {
  return new Umzug({
    migrations: migrations.map((m) => ({
      name: m.name,
      up: async () => sequelize.query(m.up(schema)),
      down: async () => {
        if (m.down) await sequelize.query(m.down(schema));
      },
    })),
    storage: new PgSchemaStorage(sequelize, schema),
    context: sequelize,
    logger: console,
  });
}
