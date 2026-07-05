import { Inject, Injectable } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import type { DeviceAuthContext } from './device-token.guard';
import type { TelemetryPayloadDto } from './dto/telemetry-payload.dto';

interface TelemetryRow {
  deviceId: string;
  ts: Date;
  key: string;
  valueNum: number | null;
  valueStr: string | null;
  valueBool: boolean | null;
  valueJson: unknown;
}

@Injectable()
export class IngestionService {
  constructor(@Inject(getConnectionToken()) private readonly sequelize: Sequelize) {}

  async ingest(deviceAuth: DeviceAuthContext, payload: TelemetryPayloadDto): Promise<void> {
    const ts = payload.ts ? new Date(payload.ts) : new Date();
    const schema = deviceAuth.schemaName;
    const rows = Object.entries(payload.values).map(([key, value]) =>
      this.toRow(deviceAuth.deviceId, ts, key, value),
    );

    await this.sequelize.transaction(async (transaction) => {
      for (const row of rows) {
        await this.sequelize.query(
          `INSERT INTO "${schema}".telemetry (device_id, ts, key, value_num, value_str, value_bool, value_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          { bind: [row.deviceId, row.ts, row.key, row.valueNum, row.valueStr, row.valueBool, row.valueJson], transaction },
        );
        await this.sequelize.query(
          `INSERT INTO "${schema}".telemetry_latest (device_id, key, ts, value_num, value_str, value_bool, value_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (device_id, key) DO UPDATE SET
             ts = EXCLUDED.ts, value_num = EXCLUDED.value_num, value_str = EXCLUDED.value_str,
             value_bool = EXCLUDED.value_bool, value_json = EXCLUDED.value_json
           WHERE "${schema}".telemetry_latest.ts <= EXCLUDED.ts`,
          { bind: [row.deviceId, row.key, row.ts, row.valueNum, row.valueStr, row.valueBool, row.valueJson], transaction },
        );
      }
      await this.sequelize.query(`UPDATE "${schema}".devices SET last_seen_at = $1 WHERE id = $2`, {
        bind: [ts, deviceAuth.deviceId],
        transaction,
      });
    });
  }

  private toRow(deviceId: string, ts: Date, key: string, value: unknown): TelemetryRow {
    const base: TelemetryRow = { deviceId, ts, key, valueNum: null, valueStr: null, valueBool: null, valueJson: null };
    if (typeof value === 'number') return { ...base, valueNum: value };
    if (typeof value === 'boolean') return { ...base, valueBool: value };
    if (typeof value === 'string') return { ...base, valueStr: value };
    return { ...base, valueJson: value };
  }
}
