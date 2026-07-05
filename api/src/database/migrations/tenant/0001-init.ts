import type { SchemaMigration } from '../../schema-migrator';

export const tenantMigrations: SchemaMigration[] = [
  {
    name: '0001-init',
    up: (schema) => `
      CREATE TABLE IF NOT EXISTS "${schema}".user_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_sub text UNIQUE NOT NULL,
        email text NOT NULL,
        display_name text,
        role text NOT NULL DEFAULT 'tenant_user',
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        transport text NOT NULL DEFAULT 'http',
        provision_type text NOT NULL DEFAULT 'access_token',
        telemetry_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
        default_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        device_profile_id uuid REFERENCES "${schema}".device_profiles(id),
        label text,
        status text NOT NULL DEFAULT 'active',
        last_seen_at timestamptz,
        firmware_version text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id uuid UNIQUE NOT NULL REFERENCES "${schema}".devices(id) ON DELETE CASCADE,
        credential_type text NOT NULL,
        token_hash text UNIQUE,
        mqtt_username text,
        mqtt_password_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_tags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_tag_map (
        device_id uuid NOT NULL REFERENCES "${schema}".devices(id) ON DELETE CASCADE,
        tag_id uuid NOT NULL REFERENCES "${schema}".device_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (device_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_attributes (
        device_id uuid NOT NULL REFERENCES "${schema}".devices(id) ON DELETE CASCADE,
        scope text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (device_id, scope, key)
      );

      CREATE TABLE IF NOT EXISTS "${schema}".telemetry (
        device_id uuid NOT NULL,
        ts timestamptz NOT NULL,
        key text NOT NULL,
        value_num double precision,
        value_str text,
        value_bool boolean,
        value_json jsonb
      );
      SELECT create_hypertable('"${schema}".telemetry', 'ts', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
      CREATE INDEX IF NOT EXISTS telemetry_device_key_ts_idx ON "${schema}".telemetry (device_id, key, ts DESC);
      ALTER TABLE "${schema}".telemetry SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'device_id, key',
        timescaledb.compress_orderby = 'ts DESC'
      );
      SELECT add_compression_policy('"${schema}".telemetry', INTERVAL '7 days', if_not_exists => TRUE);
      SELECT add_retention_policy('"${schema}".telemetry', INTERVAL '1 year', if_not_exists => TRUE);

      CREATE TABLE IF NOT EXISTS "${schema}".telemetry_latest (
        device_id uuid NOT NULL,
        key text NOT NULL,
        ts timestamptz NOT NULL,
        value_num double precision,
        value_str text,
        value_bool boolean,
        value_json jsonb,
        PRIMARY KEY (device_id, key)
      );
    `,
    down: (schema) => `
      DROP TABLE IF EXISTS "${schema}".telemetry_latest;
      DROP TABLE IF EXISTS "${schema}".telemetry;
      DROP TABLE IF EXISTS "${schema}".device_attributes;
      DROP TABLE IF EXISTS "${schema}".device_tag_map;
      DROP TABLE IF EXISTS "${schema}".device_tags;
      DROP TABLE IF EXISTS "${schema}".device_credentials;
      DROP TABLE IF EXISTS "${schema}".devices;
      DROP TABLE IF EXISTS "${schema}".device_profiles;
      DROP TABLE IF EXISTS "${schema}".user_profiles;
    `,
  },
];
