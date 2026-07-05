import type { SchemaMigration } from '../../schema-migrator';

export const controlMigrations: SchemaMigration[] = [
  {
    name: '0001-init',
    up: (schema) => `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS timescaledb;
      CREATE SCHEMA IF NOT EXISTS "${schema}";

      CREATE TABLE IF NOT EXISTS "${schema}".tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL,
        name text NOT NULL,
        schema_name text UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'provisioning',
        keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".platform_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_sub text UNIQUE NOT NULL,
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schema}".device_token_index (
        token_hash text PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES "${schema}".tenants(id),
        device_id uuid NOT NULL,
        credential_type text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
    down: (schema) => `
      DROP TABLE IF EXISTS "${schema}".device_token_index;
      DROP TABLE IF EXISTS "${schema}".platform_admins;
      DROP TABLE IF EXISTS "${schema}".tenants;
    `,
  },
];
