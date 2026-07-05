import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  let sequelize: Sequelize;
  let service: IngestionService;
  const schema = 'test_ingestion_schema';
  const deviceId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE "${schema}".devices (
        id uuid PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'active',
        last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO "${schema}".devices (id, name) VALUES ('${deviceId}', 'Sensor');
      CREATE TABLE "${schema}".telemetry (
        device_id uuid NOT NULL, ts timestamptz NOT NULL, key text NOT NULL,
        value_num double precision, value_str text, value_bool boolean, value_json jsonb
      );
      SELECT create_hypertable('"${schema}".telemetry', 'ts', if_not_exists => TRUE);
      CREATE TABLE "${schema}".telemetry_latest (
        device_id uuid NOT NULL, key text NOT NULL, ts timestamptz NOT NULL,
        value_num double precision, value_str text, value_bool boolean, value_json jsonb,
        PRIMARY KEY (device_id, key)
      );
    `);

    const moduleRef = await Test.createTestingModule({
      providers: [IngestionService, { provide: getConnectionToken(), useValue: sequelize }],
    }).compile();
    service = moduleRef.get(IngestionService);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('writes a telemetry row, upserts telemetry_latest, and updates last_seen_at', async () => {
    await service.ingest(
      { tenantId: 't1', deviceId, schemaName: schema },
      { ts: 1735689600000, values: { temp: 22.5, online: true, label: 'ok' } },
    );

    const [tempRows] = await sequelize.query(`SELECT value_num FROM "${schema}".telemetry WHERE key = 'temp'`);
    expect((tempRows as any[])[0].value_num).toBe(22.5);

    const [latestRows] = await sequelize.query(
      `SELECT key, value_num, value_bool, value_str FROM "${schema}".telemetry_latest ORDER BY key`,
    );
    expect(latestRows).toHaveLength(3);

    const [deviceRows] = await sequelize.query(`SELECT last_seen_at FROM "${schema}".devices WHERE id = '${deviceId}'`);
    expect((deviceRows as any[])[0].last_seen_at).not.toBeNull();
  });

  it('does not regress telemetry_latest when an older-timestamped point arrives late', async () => {
    await service.ingest({ tenantId: 't1', deviceId, schemaName: schema }, { ts: 1735689500000, values: { temp: 99 } });
    const [rows] = await sequelize.query(`SELECT value_num FROM "${schema}".telemetry_latest WHERE key = 'temp'`);
    expect((rows as any[])[0].value_num).toBe(22.5); // unchanged — the late point is older than what's already latest
  });
});
