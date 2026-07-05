import type { Sequelize } from 'sequelize';
import type { UmzugStorage } from 'umzug';

export class PgSchemaStorage implements UmzugStorage {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private get qualifiedTable(): string {
    return `"${this.schema}"."schema_migrations"`;
  }

  private async ensureTable(): Promise<void> {
    await this.sequelize.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await this.sequelize.query(
      `CREATE TABLE IF NOT EXISTS ${this.qualifiedTable} (
        name text PRIMARY KEY,
        run_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
  }

  async logMigration({ name }: { name: string }): Promise<void> {
    await this.ensureTable();
    await this.sequelize.query(
      `INSERT INTO ${this.qualifiedTable} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      { bind: [name] },
    );
  }

  async unlogMigration({ name }: { name: string }): Promise<void> {
    await this.ensureTable();
    await this.sequelize.query(
      `DELETE FROM ${this.qualifiedTable} WHERE name = $1`,
      {
        bind: [name],
      },
    );
  }

  async executed(): Promise<string[]> {
    await this.ensureTable();
    const [rows] = await this.sequelize.query(
      `SELECT name FROM ${this.qualifiedTable} ORDER BY run_at ASC`,
    );
    return (rows as Array<{ name: string }>).map((r) => r.name);
  }
}
