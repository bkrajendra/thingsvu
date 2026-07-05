import { Inject, Injectable } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';

export interface TelemetryPoint {
  device_id: string;
  key: string;
  ts: Date;
  value_num: number | null;
  value_str: string | null;
  value_bool: boolean | null;
  value_json: unknown;
}

@Injectable()
export class TelemetryRepository {
  constructor(@Inject(getConnectionToken()) private readonly sequelize: Sequelize) {}

  async latest(schema: string, deviceIds: string[], keys?: string[]): Promise<TelemetryPoint[]> {
    const conditions = ['device_id = ANY($1)'];
    const bind: unknown[] = [deviceIds];
    if (keys && keys.length > 0) {
      conditions.push('key = ANY($2)');
      bind.push(keys);
    }
    const [rows] = await this.sequelize.query(
      `SELECT device_id, key, ts, value_num, value_str, value_bool, value_json
       FROM "${schema}".telemetry_latest
       WHERE ${conditions.join(' AND ')}
       ORDER BY device_id, key`,
      { bind },
    );
    return rows as TelemetryPoint[];
  }

  async series(
    schema: string,
    params: { deviceId: string; key: string; from: Date; to: Date },
  ): Promise<TelemetryPoint[]> {
    const [rows] = await this.sequelize.query(
      `SELECT device_id, key, ts, value_num, value_str, value_bool, value_json
       FROM "${schema}".telemetry
       WHERE device_id = $1 AND key = $2 AND ts BETWEEN $3 AND $4
       ORDER BY ts ASC
       LIMIT 1000`,
      { bind: [params.deviceId, params.key, params.from, params.to] },
    );
    return rows as TelemetryPoint[];
  }
}
