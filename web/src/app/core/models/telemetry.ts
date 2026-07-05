export interface TelemetryPoint {
  device_id: string;
  key: string;
  ts: string;
  value_num: number | null;
  value_str: string | null;
  value_bool: boolean | null;
  value_json: unknown;
}
