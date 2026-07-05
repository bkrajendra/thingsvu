import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { TelemetryRepository } from './telemetry.repository';

describe('TelemetryRepository', () => {
  let sequelize: Sequelize;
  let repo: TelemetryRepository;
  const schema = 'test_telemetry_repo_schema';
  const deviceId = '33333333-3333-3333-3333-333333333333';

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
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
      INSERT INTO "${schema}".telemetry_latest (device_id, key, ts, value_num) VALUES
        ('${deviceId}', 'temp', now(), 21.0), ('${deviceId}', 'humidity', now(), 55.0);
      INSERT INTO "${schema}".telemetry (device_id, ts, key, value_num) VALUES
        ('${deviceId}', now() - interval '2 hours', 'temp', 20.0),
        ('${deviceId}', now() - interval '1 hour', 'temp', 20.5),
        ('${deviceId}', now(), 'temp', 21.0);
    `);

    const moduleRef = await Test.createTestingModule({
      providers: [TelemetryRepository, { provide: getConnectionToken(), useValue: sequelize }],
    }).compile();
    repo = moduleRef.get(TelemetryRepository);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('returns latest values filtered by device and key', async () => {
    const rows = await repo.latest(schema, [deviceId], ['temp']);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('temp');
    expect(Number(rows[0].value_num)).toBe(21.0);
  });

  it('returns all keys for a device when no key filter is given', async () => {
    const rows = await repo.latest(schema, [deviceId]);
    expect(rows.map((r) => r.key).sort()).toEqual(['humidity', 'temp']);
  });

  it('returns an ascending time series within the requested window', async () => {
    const rows = await repo.series(schema, {
      deviceId,
      key: 'temp',
      from: new Date(Date.now() - 3 * 3600 * 1000),
      to: new Date(),
    });
    expect(rows).toHaveLength(3);
    expect(Number(rows[0].value_num)).toBe(20.0);
    expect(Number(rows[2].value_num)).toBe(21.0);
  });
});
