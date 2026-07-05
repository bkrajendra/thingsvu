# Phase 1.1 Foundational Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1.1 "foundational testable slice" of the IoT platform from `design.md`: a tenant admin can log in with a password (via Keycloak, through a NestJS BFF), create a device, receive an access token, POST telemetry over HTTP with that token, and see the latest values in the Angular UI.

**Architecture:** NestJS 11 API (`api/`) as a cookie-session BFF in front of a self-hosted Keycloak realm, PostgreSQL+TimescaleDB with a control schema (`control`) plus one schema per tenant (`tenant_{slug}`), Redis for sessions/cache. Angular 22 SPA (`web/`) talks only to the NestJS API over same-origin `/api/v1/*` (dev proxy), never touches Keycloak directly.

**Tech Stack:** NestJS 11 (Express 5), `@nestjs/sequelize` + `sequelize` + `pg` (ORM, schema-per-tenant via `Model.schema()`), `umzug` (migrations, custom Postgres storage), `openid-client@^5` (OIDC Authorization Code + PKCE, CJS), `express-session` + `connect-redis` + `ioredis` (BFF sessions), `argon2` (MQTT-basic password hashing, added now for schema completeness though MQTT lands in Phase 1.2), Node `crypto` (SHA-256 access-token hashing), Angular 22 signals + `httpResource`, Spartan UI (already scaffolded in `web/libs/ui`), `ngx-echarts`/`echarts` (line chart).

## Global Constraints

- Node.js 22+, pnpm workspaces, no Nx. (design.md §2)
- Backend: NestJS v11, Express 5, ORM = Sequelize via `@nestjs/sequelize` for entity/metadata; telemetry uses raw Timescale SQL. (design.md §2, §12)
- Frontend: Angular v22, standalone components (no `standalone: true`, it's default), signals, no explicit `OnPush` (default in v22), `input()`/`output()` functions, `inject()` over constructor injection, Signal Forms for new forms where practical, native control flow (`@if`/`@for`), no `ngClass`/`ngStyle`. (web/.claude/CLAUDE.md — already present in repo, authoritative for all `web/` code in this plan)
- Multi-tenancy: control-plane schema `control` (shared) + per-tenant schema `tenant_{slug}`; schema bound at query time via `Model.schema(schemaName)`, never a pooled-connection-leaking `SET search_path`. (design.md §4)
- Every authenticated request's resolved tenant must be cross-checked against the token's `tenant_id` claim; mismatch = reject. (design.md §4.3)
- Device credentials stored hashed; access tokens looked up via an indexed hash, never plaintext. (design.md §5.2, §18)
- BFF cookies: httpOnly, Secure, SameSite=Lax; CSRF protection on state-changing routes. (design.md §6.2)
- Public API surface is versioned under `/api/v1` (NestJS `VersioningType.URI`). (design.md §13)
- TimescaleDB: `telemetry` is a hypertable, 1-day chunks, index `(device_id, key, ts DESC)`, retention 1 year, compression after 7 days, plus a `telemetry_latest` table for cheap "current value" reads. (design.md §5.2)
- All secrets/env validated at boot; nothing is silently defaulted for required infra (DB/Redis/Keycloak). (design.md §12)

## Deviations from design.md (explicit, scoped to keep Phase 1.1 buildable now)

1. **Realm/client names.** design.md's example realm is `iot-platform`; this repo's Keycloak (`devops/keycloak/docker-compose.yml`, already running) was provisioned manually as realm `thingsvu` with client `thingsvu` (see `keycloak.txt`, root — untracked). This plan uses the **existing** realm/client rather than recreating them, and moves the client secret out of `keycloak.txt` into `api/.env` (gitignored). Task 1 also adds `keycloak.txt` to root `.gitignore` since it currently holds a live secret.
2. **`tenant_id` claim source.** design.md §6.1 proposes a group-per-tenant with a group-attribute claim mapper. Keycloak's built-in group-membership mapper only exposes group path/name, not arbitrary attributes, per group generically. This plan instead sets a **user attribute** `tenant_id` on each Keycloak user at creation time and adds one **user-attribute protocol mapper** (`tenant_id` → token claim) on the client — same end result (a `tenant_id` claim in the ID token), less Keycloak-side machinery. Tenant groups are still created for organizational/future use.
3. **OIDC library pinned to `openid-client@^5`**, not v6+, because v6 is ESM-only and `api/` is a CommonJS NestJS project (no `"type": "module"` in `api/package.json`); v5 is the last CJS-friendly major and fully supports Authorization Code + PKCE.
4. **Keycloak admin integration is a small `fetch`-based service**, not `@keycloak/keycloak-admin-client` (also ESM-only in current majors), to avoid CJS/ESM friction. Node 22 has global `fetch`.
5. **Dashboards, OTA, tags/groups UI, audit log are out of scope** for this plan — they belong to Phase 1.2/1.3 per design.md §17 and are not needed for the Phase 1.1 acceptance test. `device_tags`/`device_tag_map`/`device_attributes` tables ARE created now (design.md §5.2 lists them under Phase 1.1's "Devices" work item) but no UI is built for them yet.
6. **Cross-tenant device-token lookup.** design.md doesn't say how an HTTP device request (bearing only a token, no JWT) finds *which tenant* to query when `device_credentials` lives inside each tenant's schema. This plan adds a small control-plane index table `control.device_token_index (token_hash PK, tenant_id, device_id, credential_type)`, populated whenever a credential is issued, giving O(1) tenant resolution for device-facing endpoints without scanning every tenant schema.
7. **Swagger/OpenAPI generation** (design.md §13) is enabled via the `@nestjs/swagger` Nest CLI plugin (auto DTO metadata, no manual `@ApiProperty` spam) but is not a per-task deliverable — it comes free once DTOs use `class-validator` decorators.
8. **`packages/shared-types`** (design.md §14) is deferred; Phase 1.1 API response shapes are duplicated as small local TypeScript interfaces in `web/src/app/core/models`. Not worth a shared package until Phase 1.2 adds the dashboard JSON contract.

## File Structure

```
devops/
  docker-compose.dev.yml          # NEW: postgres+timescaledb, redis (keycloak stays in devops/keycloak/)

api/
  .env.example                    # NEW
  nest-cli.json                   # MODIFY: enable @nestjs/swagger plugin
  src/
    main.ts                       # MODIFY: /api prefix, URI versioning, cookie/session, swagger, ValidationPipe
    app.module.ts                 # MODIFY: wire new modules
    config/
      env.validation.ts           # NEW: Joi schema
      config.module.ts            # NEW
    database/
      pg-schema-storage.ts        # NEW: Umzug storage, tracks applied migrations per schema
      schema-migrator.ts          # NEW: Umzug factory bound to a schema
      database.module.ts          # NEW: SequelizeModule.forRootAsync
      migrations/
        control/0001-init.ts      # NEW: control.tenants, platform_admins, device_token_index
        tenant/0001-init.ts       # NEW: tenant schema tables incl. telemetry hypertable
      models/
        control/tenant.model.ts               # NEW
        control/platform-admin.model.ts       # NEW
        control/device-token-index.model.ts   # NEW
        tenant/user-profile.model.ts          # NEW
        tenant/device-profile.model.ts        # NEW
        tenant/device.model.ts                # NEW
        tenant/device-credential.model.ts     # NEW
        tenant/device-tag.model.ts            # NEW
        tenant/device-tag-map.model.ts        # NEW
        tenant/device-attribute.model.ts      # NEW
        tenant/telemetry-latest.model.ts      # NEW
      scripts/
        migrate-control.ts       # NEW: pnpm run migrate:control
        migrate-tenants.ts       # NEW: pnpm run migrate:tenants
        seed-demo.ts              # NEW: pnpm run seed:demo
    tenancy/
      tenant-context.ts           # NEW: AsyncLocalStorage<{tenantId, schemaName, slug}>
      tenant-resolution.middleware.ts  # NEW: subdomain -> tenant, Redis-cached
      tenant.guard.ts              # NEW: cross-checks resolved tenant vs session tenant_id claim
      tenant-provisioning.service.ts  # NEW
      tenancy.module.ts            # NEW
    common/
      roles.decorator.ts          # NEW
      roles.guard.ts               # NEW
      current-user.decorator.ts    # NEW
      slug.util.ts                 # NEW
    redis/
      redis.module.ts               # NEW: ioredis provider (shared by sessions + tenant cache)
    keycloak/
      keycloak-admin.service.ts     # NEW: fetch-based admin REST client
      keycloak.module.ts            # NEW
      bootstrap-realm.ts             # NEW: pnpm run keycloak:bootstrap (idempotent)
    auth/
      oidc-client.provider.ts       # NEW: openid-client Issuer discovery + Client
      session.types.ts               # NEW
      csrf.middleware.ts             # NEW
      auth.service.ts                # NEW
      auth.controller.ts             # NEW
      auth.module.ts                  # NEW
    tenants/
      dto/create-tenant.dto.ts, update-tenant.dto.ts   # NEW
      tenants.controller.ts, tenants.service.ts, tenants.module.ts  # NEW
    users/
      dto/create-user.dto.ts, update-user.dto.ts        # NEW
      users.controller.ts, users.service.ts, users.module.ts        # NEW
    device-profiles/
      dto/create-device-profile.dto.ts                  # NEW
      device-profiles.controller.ts/.service.ts/.module.ts          # NEW
    devices/
      dto/create-device.dto.ts                           # NEW
      devices.controller.ts/.service.ts/.module.ts        # NEW
      device-credentials.service.ts                       # NEW
    ingestion/
      dto/telemetry-payload.dto.ts                        # NEW
      device-token.guard.ts                                # NEW
      ingestion.controller.ts/.service.ts/.module.ts        # NEW
    telemetry/
      telemetry.repository.ts                              # NEW: raw SQL, schema-qualified
      telemetry.controller.ts/.module.ts                    # NEW

web/
  proxy.conf.json                 # NEW: /api -> http://localhost:3000
  angular.json                    # MODIFY: wire proxy config into serve target
  src/
    app/
      app.config.ts               # MODIFY: provideHttpClient(withInterceptors), icons
      app.routes.ts                # MODIFY: real routes + guards
      app.ts / app.html            # MODIFY: replace placeholder with shell + router-outlet
      core/
        models/session.ts, device.ts, telemetry.ts   # NEW
        auth/auth.service.ts, auth.guard.ts            # NEW
        http/api.interceptor.ts                          # NEW
      layout/
        shell.ts                                          # NEW: responsive sidebar/topbar/drawer
      features/
        auth/login-page.ts                                # NEW
        devices/devices.service.ts, devices-list.page.ts, device-create.page.ts  # NEW
        telemetry/telemetry.service.ts, telemetry-view.page.ts                    # NEW
```

---

## Task 1: Dev infrastructure — Postgres/TimescaleDB + Redis, env files, gitignore

**Files:**
- Create: `devops/docker-compose.dev.yml`
- Create: `api/.env.example`
- Create: `api/.env` (local only, not committed — copy of `.env.example` with real values)
- Modify: `.gitignore` (root)
- Test: manual (`docker compose` health check) — no application code exists yet to unit test

**Interfaces:**
- Produces: running Postgres+TimescaleDB on `localhost:5432` (db `iot_platform`, user/pass `postgres`/`postgres`), Redis on `localhost:6379`. Every later task's config/tests assume these are reachable.

- [ ] **Step 1: Write the compose file**

`devops/docker-compose.dev.yml`:
```yaml
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: iot-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: iot_platform
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: iot-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
```

- [ ] **Step 2: Bring the stack up and verify**

Run: `docker compose -f devops/docker-compose.dev.yml up -d`
Then: `docker exec -it iot-postgres psql -U postgres -d iot_platform -c "SELECT 1;"`
Expected: returns `1` (confirms Postgres is reachable and the `iot_platform` database exists).

Run: `docker exec -it iot-redis redis-cli PING`
Expected: `PONG`

- [ ] **Step 3: Write `api/.env.example`**

```dotenv
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
WEB_BASE_URL=http://localhost:4200

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=iot_platform

REDIS_HOST=localhost
REDIS_PORT=6379

SESSION_SECRET=change-me-dev-session-secret
SESSION_COOKIE_NAME=sid
SESSION_TTL_SECONDS=86400

KEYCLOAK_REALM=thingsvu
KEYCLOAK_ISSUER=http://localhost:8081/realms/thingsvu
KEYCLOAK_CLIENT_ID=thingsvu
KEYCLOAK_CLIENT_SECRET=change-me
KEYCLOAK_ADMIN_BASE_URL=http://localhost:8081
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=adminpassword

DEVICE_TOKEN_HASH_SECRET=change-me-dev-device-token-pepper
```

- [ ] **Step 4: Create the real `api/.env`**

Copy `api/.env.example` to `api/.env` and set `KEYCLOAK_CLIENT_SECRET` to the value currently in `keycloak.txt` (root). `api/.gitignore` already ignores `.env` (verified: line `.env` present), so this file will not be committed.

- [ ] **Step 5: Stop leaking the Keycloak secret from the repo root**

Edit root `.gitignore`, add:
```
keycloak.txt
```
(The secret now lives in `api/.env`; `keycloak.txt` is redundant. Leave the file on disk since it's already untracked, just make sure it can never be accidentally committed.)

- [ ] **Step 6: Commit**

```bash
git add devops/docker-compose.dev.yml api/.env.example .gitignore
git commit -m "chore: add dev docker-compose for postgres/timescaledb + redis"
```
(Do not `git add api/.env` — it's gitignored and contains a secret.)

---

## Task 2: Backend bootstrap — env validation, `/api/v1` prefix, sessions scaffold, Swagger

**Files:**
- Create: `api/src/config/env.validation.ts`
- Create: `api/src/config/config.module.ts`
- Modify: `api/src/main.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/nest-cli.json`
- Install: `@nestjs/config joi @nestjs/swagger class-validator class-transformer cookie-parser` (+ `@types/cookie-parser` dev)
- Test: `api/src/config/env.validation.spec.ts`

**Interfaces:**
- Produces: `ConfigModule` (global), exporting a typed `AppConfig` shape read via `configService.get<AppConfig>('app')` etc. Every later backend task reads config through `ConfigService`, never `process.env` directly.
- Produces: app listens with global prefix `api`, URI versioning (`v1`), global `ValidationPipe({ whitelist: true, transform: true })`, `cookie-parser` installed as middleware.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter api add @nestjs/config joi @nestjs/swagger class-validator class-transformer cookie-parser`
Run: `pnpm --filter api add -D @types/cookie-parser`

- [ ] **Step 2: Write the failing env validation test**

`api/src/config/env.validation.spec.ts`:
```ts
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'development',
    PORT: '3000',
    APP_BASE_URL: 'http://localhost:3000',
    WEB_BASE_URL: 'http://localhost:4200',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'iot_platform',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    SESSION_SECRET: 'secret',
    SESSION_COOKIE_NAME: 'sid',
    SESSION_TTL_SECONDS: '86400',
    KEYCLOAK_REALM: 'thingsvu',
    KEYCLOAK_ISSUER: 'http://localhost:8081/realms/thingsvu',
    KEYCLOAK_CLIENT_ID: 'thingsvu',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    KEYCLOAK_ADMIN_BASE_URL: 'http://localhost:8081',
    KEYCLOAK_ADMIN_USERNAME: 'admin',
    KEYCLOAK_ADMIN_PASSWORD: 'adminpassword',
    DEVICE_TOKEN_HASH_SECRET: 'pepper',
  };

  it('accepts a fully populated environment', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('rejects a missing required variable', () => {
    const { DB_HOST, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DB_HOST/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'not-a-number' })).toThrow();
  });
});
```

- [ ] **Step 2b: Run it to confirm it fails**

Run: `pnpm --filter api test env.validation`
Expected: FAIL — `Cannot find module './env.validation'`

- [ ] **Step 3: Implement `env.validation.ts`**

```ts
import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri().required(),
  WEB_BASE_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),

  SESSION_SECRET: Joi.string().min(8).required(),
  SESSION_COOKIE_NAME: Joi.string().default('sid'),
  SESSION_TTL_SECONDS: Joi.number().positive().default(86400),

  KEYCLOAK_REALM: Joi.string().required(),
  KEYCLOAK_ISSUER: Joi.string().uri().required(),
  KEYCLOAK_CLIENT_ID: Joi.string().required(),
  KEYCLOAK_CLIENT_SECRET: Joi.string().required(),
  KEYCLOAK_ADMIN_BASE_URL: Joi.string().uri().required(),
  KEYCLOAK_ADMIN_USERNAME: Joi.string().required(),
  KEYCLOAK_ADMIN_PASSWORD: Joi.string().required(),

  DEVICE_TOKEN_HASH_SECRET: Joi.string().min(8).required(),
}).unknown(true);

export type EnvShape = Record<string, string | undefined>;

export function validateEnv(env: EnvShape): EnvShape {
  const { error, value } = envSchema.validate(env, { abortEarly: false });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  return value;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter api test env.validation`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire `ConfigModule` globally**

`api/src/config/config.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
```

- [ ] **Step 6: Update `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [ConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 7: Update `main.ts`** (prefix, versioning, validation pipe, cookies, swagger)

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.WEB_BASE_URL, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('IoT Platform API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 8: Enable the Swagger CLI plugin**

Edit `api/nest-cli.json`, add a `compilerOptions.plugins` entry:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```
(Read the existing file first and merge — don't drop any existing keys.)

- [ ] **Step 9: Verify the app still boots**

Run: `pnpm --filter api start:dev`
Expected: server starts on port 3000, logs no errors, `http://localhost:3000/api/docs` returns the Swagger UI. Stop with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add api/src/config api/src/main.ts api/src/app.module.ts api/nest-cli.json api/package.json pnpm-lock.yaml
git commit -m "feat(api): env validation, /api/v1 prefix, swagger, validation pipe"
```

---

## Task 3: Control-plane database — Sequelize connection, migration runner, control schema

**Files:**
- Create: `api/src/database/pg-schema-storage.ts`
- Create: `api/src/database/schema-migrator.ts`
- Create: `api/src/database/database.module.ts`
- Create: `api/src/database/migrations/control/0001-init.ts`
- Create: `api/src/database/models/control/tenant.model.ts`
- Create: `api/src/database/models/control/platform-admin.model.ts`
- Create: `api/src/database/models/control/device-token-index.model.ts`
- Create: `api/src/database/scripts/migrate-control.ts`
- Modify: `api/package.json` (add `migrate:control` script)
- Modify: `api/src/app.module.ts`
- Install: `sequelize pg pg-hstore @nestjs/sequelize umzug`
- Test: `api/src/database/pg-schema-storage.spec.ts`, `api/src/database/schema-migrator.spec.ts`

**Interfaces:**
- Produces: `SchemaMigration = { name: string; up: (schema: string) => string; down?: (schema: string) => string }` — every later migration file (tenant migrations in Task 4) implements this shape.
- Produces: `createSchemaMigrator(sequelize: Sequelize, schema: string, migrations: SchemaMigration[]): Umzug` — reused by `migrate-control.ts`, `migrate-tenants.ts` (Task 4), and directly by `TenantProvisioningService` (Task 4).
- Produces: `PgSchemaStorage` — tracks applied migration names in `"{schema}".schema_migrations`.
- Produces: Sequelize models `ControlTenant`, `ControlPlatformAdmin`, `ControlDeviceTokenIndex`, registered in a `control` schema, injectable via `@InjectModel(...)`.
- Consumes: `ConfigService` from Task 2 for DB connection settings.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter api add sequelize pg pg-hstore @nestjs/sequelize umzug`

- [ ] **Step 2: Write the failing storage test**

`api/src/database/pg-schema-storage.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter api test pg-schema-storage`
Expected: FAIL — `Cannot find module './pg-schema-storage'`
(Requires the Task 1 Postgres container to be running.)

- [ ] **Step 4: Implement `pg-schema-storage.ts`**

```ts
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
    await this.sequelize.query(`DELETE FROM ${this.qualifiedTable} WHERE name = $1`, {
      bind: [name],
    });
  }

  async executed(): Promise<string[]> {
    await this.ensureTable();
    const [rows] = await this.sequelize.query(
      `SELECT name FROM ${this.qualifiedTable} ORDER BY run_at ASC`,
    );
    return (rows as Array<{ name: string }>).map((r) => r.name);
  }
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `pnpm --filter api test pg-schema-storage`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing migrator test**

`api/src/database/schema-migrator.spec.ts`:
```ts
import { Sequelize } from 'sequelize';
import { createSchemaMigrator, SchemaMigration } from './schema-migrator';

describe('createSchemaMigrator', () => {
  let sequelize: Sequelize;
  const schema = 'test_migrator_schema';

  const migrations: SchemaMigration[] = [
    {
      name: '0001-create-widgets',
      up: (s) => `CREATE TABLE "${s}".widgets (id serial PRIMARY KEY)`,
      down: (s) => `DROP TABLE "${s}".widgets`,
    },
  ];

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

  it('applies pending migrations and records them', async () => {
    const migrator = createSchemaMigrator(sequelize, schema, migrations);
    const applied = await migrator.up();
    expect(applied.map((m) => m.name)).toEqual(['0001-create-widgets']);

    const [[{ exists }]] = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = 'widgets')`,
    );
    expect(exists).toBe(true);
  });

  it('is idempotent on a second run', async () => {
    const migrator = createSchemaMigrator(sequelize, schema, migrations);
    const applied = await migrator.up();
    expect(applied).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `pnpm --filter api test schema-migrator`
Expected: FAIL — `Cannot find module './schema-migrator'`

- [ ] **Step 8: Implement `schema-migrator.ts`**

```ts
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
```

- [ ] **Step 9: Run it to confirm it passes**

Run: `pnpm --filter api test schema-migrator`
Expected: PASS (2 tests)

- [ ] **Step 10: Write the control schema migration**

`api/src/database/migrations/control/0001-init.ts`:
```ts
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
```

- [ ] **Step 11: Write the control Sequelize models**

These use plain `sequelize` model classes (not `sequelize-typescript`, which isn't installed) — `@nestjs/sequelize` wraps plain `sequelize`.

`api/src/database/models/control/tenant.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlTenant extends Model {
  declare id: string;
  declare slug: string;
  declare name: string;
  declare schemaName: string;
  declare status: 'provisioning' | 'active' | 'suspended';
  declare keycloakGroupId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlTenant {
    ControlTenant.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        slug: { type: DataTypes.STRING, unique: true, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        schemaName: { type: DataTypes.STRING, field: 'schema_name', unique: true, allowNull: false },
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'provisioning' },
        keycloakGroupId: { type: DataTypes.STRING, field: 'keycloak_group_id', allowNull: true },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'tenants',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return ControlTenant;
  }
}
```

`api/src/database/models/control/platform-admin.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlPlatformAdmin extends Model {
  declare id: string;
  declare keycloakSub: string;
  declare email: string;
  declare readonly createdAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlPlatformAdmin {
    ControlPlatformAdmin.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        keycloakSub: { type: DataTypes.STRING, field: 'keycloak_sub', unique: true, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'platform_admins',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return ControlPlatformAdmin;
  }
}
```

`api/src/database/models/control/device-token-index.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlDeviceTokenIndex extends Model {
  declare tokenHash: string;
  declare tenantId: string;
  declare deviceId: string;
  declare credentialType: 'access_token' | 'mqtt_basic';
  declare readonly createdAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlDeviceTokenIndex {
    ControlDeviceTokenIndex.init(
      {
        tokenHash: { type: DataTypes.STRING, field: 'token_hash', primaryKey: true },
        tenantId: { type: DataTypes.UUID, field: 'tenant_id', allowNull: false },
        deviceId: { type: DataTypes.UUID, field: 'device_id', allowNull: false },
        credentialType: { type: DataTypes.STRING, field: 'credential_type', allowNull: false },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'device_token_index',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return ControlDeviceTokenIndex;
  }
}
```

- [ ] **Step 12: Write `database.module.ts`**

`@nestjs/sequelize`'s `forRootAsync({ models: [...] })` option expects `sequelize-typescript`-decorated classes. Since Task 3 uses plain `sequelize` model classes instead, register them explicitly by calling each model's static `initModel(sequelize)` from a factory provider that depends on the `Sequelize` instance, so they're guaranteed initialized before any other provider uses them:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule, getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { ControlTenant } from './models/control/tenant.model';
import { ControlPlatformAdmin } from './models/control/platform-admin.model';
import { ControlDeviceTokenIndex } from './models/control/device-token-index.model';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        logging: false,
      }),
    }),
  ],
  providers: [
    {
      provide: 'CONTROL_MODELS_REGISTERED',
      inject: [getConnectionToken()],
      useFactory: (sequelize: Sequelize) => {
        ControlTenant.initModel(sequelize);
        ControlPlatformAdmin.initModel(sequelize);
        ControlDeviceTokenIndex.initModel(sequelize);
        return true;
      },
    },
  ],
  exports: [SequelizeModule, 'CONTROL_MODELS_REGISTERED'],
})
export class DatabaseModule {}

**Erratum found during Task 3 execution:** the original text above used `inject: [Sequelize]`, which fails at runtime (`@nestjs/sequelize` registers its connection under `getConnectionToken()`, not the bare `Sequelize` class) — `Nest can't resolve dependencies of the CONTROL_MODELS_REGISTERED (?)`. Fixed to `inject: [getConnectionToken()]` above; this is the version to implement.

**Second erratum found during Task 3 execution:** `PgSchemaStorage.ensureTable()` (Step 4) must also `CREATE SCHEMA IF NOT EXISTS "${this.schema}"` before creating the tracking table — Umzug calls `storage.executed()` before running any migration SQL, so for a schema that doesn't exist yet (like `control` on a fresh database), the tracking table's own `CREATE TABLE` fails with `3F000 invalid_schema_name` before the migration that would have created the schema ever runs. The corrected `pg-schema-storage.ts` (already fixed in the repo) is:

```ts
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
    await this.sequelize.query(`DELETE FROM ${this.qualifiedTable} WHERE name = $1`, {
      bind: [name],
    });
  }

  async executed(): Promise<string[]> {
    await this.ensureTable();
    const [rows] = await this.sequelize.query(
      `SELECT name FROM ${this.qualifiedTable} ORDER BY run_at ASC`,
    );
    return (rows as Array<{ name: string }>).map((r) => r.name);
  }
}
```
```

Any provider that uses `ControlTenant` etc. must list `'CONTROL_MODELS_REGISTERED'` in its own module's `imports`/dependency chain (importing `DatabaseModule` is enough, since Nest resolves the factory provider before other providers in modules that import it) so the model is guaranteed initialized before first use.

- [ ] **Step 13: Wire `DatabaseModule` into `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 14: Write the `migrate:control` script**

`api/src/database/scripts/migrate-control.ts`:
```ts
import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { createSchemaMigrator } from '../schema-migrator';
import { controlMigrations } from '../migrations/control/0001-init';

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
  });
  const migrator = createSchemaMigrator(sequelize, 'control', controlMigrations);
  const applied = await migrator.up();
  console.log(`Applied ${applied.length} control migration(s):`, applied.map((m) => m.name));
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run: `pnpm --filter api add dotenv ts-node` if `ts-node` isn't already a dependency (it is, as a devDependency — reuse it).

Add to `api/package.json` `scripts`:
```json
"migrate:control": "ts-node -r tsconfig-paths/register src/database/scripts/migrate-control.ts"
```

- [ ] **Step 15: Run the control migration for real**

Run: `pnpm --filter api run migrate:control`
Expected: `Applied 1 control migration(s): [ '0001-init' ]`

Verify: `docker exec -it iot-postgres psql -U postgres -d iot_platform -c "\dt control.*"`
Expected: lists `tenants`, `platform_admins`, `device_token_index`, `schema_migrations`.

- [ ] **Step 16: Run the full test suite and confirm the app still boots**

Run: `pnpm --filter api test`
Expected: all specs PASS.
Run: `pnpm --filter api start:dev`, confirm no errors, Ctrl+C to stop.

- [ ] **Step 17: Commit**

```bash
git add api/src/database api/package.json api/src/app.module.ts pnpm-lock.yaml
git commit -m "feat(api): control-plane schema, migration runner, sequelize connection"
```

---

## Task 4: Tenant schema migrations + `TenantProvisioningService`

**Files:**
- Create: `api/src/database/migrations/tenant/0001-init.ts`
- Create: `api/src/database/models/tenant/*.model.ts` (7 files: user-profile, device-profile, device, device-credential, device-tag, device-tag-map, device-attribute, telemetry-latest)
- Create: `api/src/tenancy/tenant-provisioning.service.ts`
- Create: `api/src/tenancy/tenancy.module.ts`
- Create: `api/src/common/slug.util.ts`
- Create: `api/src/database/scripts/migrate-tenants.ts`
- Modify: `api/package.json` (add `migrate:tenants` script)
- Test: `api/src/common/slug.util.spec.ts`, `api/src/tenancy/tenant-provisioning.service.spec.ts`

**Interfaces:**
- Consumes: `createSchemaMigrator` and `SchemaMigration` from Task 3, `ControlTenant` model from Task 3.
- Produces: `assertValidSlug(slug: string): void` (throws `BadRequestException` on invalid slugs) — reused by `TenantsController` (Task 8).
- Produces: `TenantProvisioningService.provision({ slug, name }): Promise<{ id: string; slug: string; schemaName: string; status: string }>` — reused by `TenantsController` (Task 8) and `seed-demo.ts` (Task 14).
- Produces: tenant-schema Sequelize model classes, each exporting `initModel(sequelize: Sequelize): typeof Model` — reused by every tenant-scoped service (Tasks 9–13) via `Model.schema(schemaName)`.

- [ ] **Step 1: Write the failing slug validator test**

`api/src/common/slug.util.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { assertValidSlug } from './slug.util';

describe('assertValidSlug', () => {
  it('accepts a valid slug', () => {
    expect(() => assertValidSlug('acme')).not.toThrow();
    expect(() => assertValidSlug('acme_corp2')).not.toThrow();
  });

  it('rejects a slug starting with a digit', () => {
    expect(() => assertValidSlug('2acme')).toThrow(BadRequestException);
  });

  it('rejects uppercase and special characters', () => {
    expect(() => assertValidSlug('Acme-Inc')).toThrow(BadRequestException);
  });

  it('rejects a slug shorter than 2 characters', () => {
    expect(() => assertValidSlug('a')).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test slug.util` → FAIL (module not found).

`api/src/common/slug.util.ts`:
```ts
import { BadRequestException } from '@nestjs/common';

const SLUG_RE = /^[a-z][a-z0-9_]{1,30}$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException(
      'Tenant slug must start with a lowercase letter and contain only lowercase letters, digits, and underscores (2-31 chars total).',
    );
  }
}

export function schemaNameForSlug(slug: string): string {
  assertValidSlug(slug);
  return `tenant_${slug}`;
}
```

Run: `pnpm --filter api test slug.util` → PASS (4 tests)

- [ ] **Step 3: Write the tenant schema migration**

`api/src/database/migrations/tenant/0001-init.ts`:
```ts
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
```

- [ ] **Step 4: Write the tenant-schema Sequelize models**

Each model is schema-agnostic at `initModel` time (no `schema:` option) so the caller binds it per-request via `Model.schema(schemaName)`.

`api/src/database/models/tenant/user-profile.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class UserProfile extends Model {
  declare id: string;
  declare keycloakSub: string;
  declare email: string;
  declare displayName: string | null;
  declare role: 'tenant_admin' | 'tenant_user';
  declare status: 'active' | 'disabled';

  static initModel(sequelize: Sequelize): typeof UserProfile {
    UserProfile.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        keycloakSub: { type: DataTypes.STRING, field: 'keycloak_sub', unique: true, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        displayName: { type: DataTypes.STRING, field: 'display_name', allowNull: true },
        role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'tenant_user' },
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
      },
      {
        sequelize,
        tableName: 'user_profiles',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return UserProfile;
  }
}
```

`api/src/database/models/tenant/device-profile.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceProfile extends Model {
  declare id: string;
  declare name: string;
  declare transport: 'mqtt' | 'http' | 'default';
  declare provisionType: 'access_token' | 'mqtt_basic';
  declare telemetryKeys: unknown[];
  declare defaultAttributes: Record<string, unknown>;

  static initModel(sequelize: Sequelize): typeof DeviceProfile {
    DeviceProfile.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: { type: DataTypes.STRING, allowNull: false },
        transport: { type: DataTypes.STRING, allowNull: false, defaultValue: 'http' },
        provisionType: { type: DataTypes.STRING, field: 'provision_type', allowNull: false, defaultValue: 'access_token' },
        telemetryKeys: { type: DataTypes.JSONB, field: 'telemetry_keys', allowNull: false, defaultValue: [] },
        defaultAttributes: { type: DataTypes.JSONB, field: 'default_attributes', allowNull: false, defaultValue: {} },
      },
      {
        sequelize,
        tableName: 'device_profiles',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return DeviceProfile;
  }
}
```

`api/src/database/models/tenant/device.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class Device extends Model {
  declare id: string;
  declare name: string;
  declare deviceProfileId: string | null;
  declare label: string | null;
  declare status: 'active' | 'inactive';
  declare lastSeenAt: Date | null;
  declare firmwareVersion: string | null;

  static initModel(sequelize: Sequelize): typeof Device {
    Device.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: { type: DataTypes.STRING, allowNull: false },
        deviceProfileId: { type: DataTypes.UUID, field: 'device_profile_id', allowNull: true },
        label: { type: DataTypes.STRING, allowNull: true },
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
        lastSeenAt: { type: DataTypes.DATE, field: 'last_seen_at', allowNull: true },
        firmwareVersion: { type: DataTypes.STRING, field: 'firmware_version', allowNull: true },
      },
      {
        sequelize,
        tableName: 'devices',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return Device;
  }
}
```

`api/src/database/models/tenant/device-credential.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceCredential extends Model {
  declare id: string;
  declare deviceId: string;
  declare credentialType: 'access_token' | 'mqtt_basic';
  declare tokenHash: string | null;
  declare mqttUsername: string | null;
  declare mqttPasswordHash: string | null;

  static initModel(sequelize: Sequelize): typeof DeviceCredential {
    DeviceCredential.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        deviceId: { type: DataTypes.UUID, field: 'device_id', unique: true, allowNull: false },
        credentialType: { type: DataTypes.STRING, field: 'credential_type', allowNull: false },
        tokenHash: { type: DataTypes.STRING, field: 'token_hash', unique: true, allowNull: true },
        mqttUsername: { type: DataTypes.STRING, field: 'mqtt_username', allowNull: true },
        mqttPasswordHash: { type: DataTypes.STRING, field: 'mqtt_password_hash', allowNull: true },
      },
      {
        sequelize,
        tableName: 'device_credentials',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return DeviceCredential;
  }
}
```

`api/src/database/models/tenant/device-tag.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceTag extends Model {
  declare id: string;
  declare name: string;

  static initModel(sequelize: Sequelize): typeof DeviceTag {
    DeviceTag.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: { type: DataTypes.STRING, unique: true, allowNull: false },
      },
      { sequelize, tableName: 'device_tags', underscored: true, timestamps: false },
    );
    return DeviceTag;
  }
}
```

`api/src/database/models/tenant/device-tag-map.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceTagMap extends Model {
  declare deviceId: string;
  declare tagId: string;

  static initModel(sequelize: Sequelize): typeof DeviceTagMap {
    DeviceTagMap.init(
      {
        deviceId: { type: DataTypes.UUID, field: 'device_id', primaryKey: true },
        tagId: { type: DataTypes.UUID, field: 'tag_id', primaryKey: true },
      },
      { sequelize, tableName: 'device_tag_map', underscored: true, timestamps: false },
    );
    return DeviceTagMap;
  }
}
```

`api/src/database/models/tenant/device-attribute.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceAttribute extends Model {
  declare deviceId: string;
  declare scope: 'client' | 'server' | 'shared';
  declare key: string;
  declare value: unknown;

  static initModel(sequelize: Sequelize): typeof DeviceAttribute {
    DeviceAttribute.init(
      {
        deviceId: { type: DataTypes.UUID, field: 'device_id', primaryKey: true },
        scope: { type: DataTypes.STRING, primaryKey: true },
        key: { type: DataTypes.STRING, primaryKey: true },
        value: { type: DataTypes.JSONB, allowNull: false },
      },
      {
        sequelize,
        tableName: 'device_attributes',
        underscored: true,
        timestamps: true,
        createdAt: false,
        updatedAt: 'updated_at',
      },
    );
    return DeviceAttribute;
  }
}
```

`api/src/database/models/tenant/telemetry-latest.model.ts`:
```ts
import { DataTypes, Model, type Sequelize } from 'sequelize';

export class TelemetryLatest extends Model {
  declare deviceId: string;
  declare key: string;
  declare ts: Date;
  declare valueNum: number | null;
  declare valueStr: string | null;
  declare valueBool: boolean | null;
  declare valueJson: unknown;

  static initModel(sequelize: Sequelize): typeof TelemetryLatest {
    TelemetryLatest.init(
      {
        deviceId: { type: DataTypes.UUID, field: 'device_id', primaryKey: true },
        key: { type: DataTypes.STRING, primaryKey: true },
        ts: { type: DataTypes.DATE, allowNull: false },
        valueNum: { type: DataTypes.DOUBLE, field: 'value_num', allowNull: true },
        valueStr: { type: DataTypes.TEXT, field: 'value_str', allowNull: true },
        valueBool: { type: DataTypes.BOOLEAN, field: 'value_bool', allowNull: true },
        valueJson: { type: DataTypes.JSONB, field: 'value_json', allowNull: true },
      },
      { sequelize, tableName: 'telemetry_latest', underscored: true, timestamps: false },
    );
    return TelemetryLatest;
  }
}
```

- [ ] **Step 5: Write the failing provisioning service test**

`api/src/tenancy/tenant-provisioning.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ControlTenant } from '../database/models/control/tenant.model';

describe('TenantProvisioningService', () => {
  let sequelize: Sequelize;
  let service: TenantProvisioningService;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS control.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL,
        name text NOT NULL,
        schema_name text UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'provisioning',
        keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    ControlTenant.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({
      providers: [TenantProvisioningService, { provide: getConnectionToken(), useValue: sequelize }],
    }).compile();
    service = moduleRef.get(TenantProvisioningService);
  });

  afterEach(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS tenant_provtest CASCADE`);
    await sequelize.query(`DELETE FROM control.tenants WHERE slug = 'provtest'`);
  });

  afterAll(async () => {
    await sequelize.query('DROP SCHEMA IF EXISTS control CASCADE');
    await sequelize.close();
  });

  it('creates the schema, applies tenant migrations, and marks the tenant active', async () => {
    const result = await service.provision({ slug: 'provtest', name: 'Prov Test' });

    expect(result.status).toBe('active');
    expect(result.schemaName).toBe('tenant_provtest');

    const [[{ exists }]] = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'tenant_provtest' AND table_name = 'devices')`,
    );
    expect(exists).toBe(true);
  });

  it('rejects a duplicate slug without leaving a partial schema behind', async () => {
    await service.provision({ slug: 'provtest', name: 'Prov Test' });
    await expect(service.provision({ slug: 'provtest', name: 'Prov Test Again' })).rejects.toThrow();

    const [rows] = await sequelize.query(`SELECT count(*)::int AS count FROM control.tenants WHERE slug = 'provtest'`);
    expect((rows as Array<{ count: number }>)[0].count).toBe(1);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm --filter api test tenant-provisioning`
Expected: FAIL — `Cannot find module './tenant-provisioning.service'`

- [ ] **Step 7: Implement `TenantProvisioningService`**

Postgres DDL is transactional, so wrapping schema creation + tenant migration SQL + the `control.tenants` insert in one transaction gives atomic rollback on any failure — no manual cleanup path needed.

`api/src/tenancy/tenant-provisioning.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { assertValidSlug, schemaNameForSlug } from '../common/slug.util';
import { ControlTenant } from '../database/models/control/tenant.model';
import { tenantMigrations } from '../database/migrations/tenant/0001-init';

export interface ProvisionTenantInput {
  slug: string;
  name: string;
}

export interface ProvisionedTenant {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  status: string;
}

@Injectable()
export class TenantProvisioningService {
  constructor(@Inject(getConnectionToken()) private readonly sequelize: Sequelize) {}

  async provision(input: ProvisionTenantInput): Promise<ProvisionedTenant> {
    assertValidSlug(input.slug);
    const schemaName = schemaNameForSlug(input.slug);

    const existing = await ControlTenant.findOne({ where: { slug: input.slug } });
    if (existing) {
      throw new ConflictException(`Tenant slug "${input.slug}" already exists`);
    }

    return this.sequelize.transaction(async (transaction) => {
      const tenant = await ControlTenant.create(
        { slug: input.slug, name: input.name, schemaName, status: 'provisioning' },
        { transaction },
      );

      await this.sequelize.query(`CREATE SCHEMA "${schemaName}"`, { transaction });

      for (const migration of tenantMigrations) {
        await this.sequelize.query(migration.up(schemaName), { transaction });
      }
      await this.sequelize.query(
        `CREATE TABLE IF NOT EXISTS "${schemaName}".schema_migrations (
          name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now()
        )`,
        { transaction },
      );
      for (const migration of tenantMigrations) {
        await this.sequelize.query(
          `INSERT INTO "${schemaName}".schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
          { bind: [migration.name], transaction },
        );
      }

      tenant.status = 'active';
      await tenant.save({ transaction });

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        schemaName: tenant.schemaName,
        status: tenant.status,
      };
    });
  }
}
```

- [ ] **Step 8: Run it to confirm it passes**

Run: `pnpm --filter api test tenant-provisioning`
Expected: PASS (2 tests)

- [ ] **Step 9: Write `tenancy.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  imports: [DatabaseModule],
  providers: [TenantProvisioningService],
  exports: [TenantProvisioningService],
})
export class TenancyModule {}
```

- [ ] **Step 10: Write the `migrate:tenants` script** (applies any *new* tenant migrations to already-provisioned tenants — a no-op today since there's only one migration, but required by design.md §12's "migrate:tenants command iterates active schemas")

`api/src/database/scripts/migrate-tenants.ts`:
```ts
import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { createSchemaMigrator } from '../schema-migrator';
import { tenantMigrations } from '../migrations/tenant/0001-init';
import { ControlTenant } from '../models/control/tenant.model';

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
  });
  ControlTenant.initModel(sequelize);

  const tenants = await ControlTenant.findAll({ where: { status: 'active' } });
  for (const tenant of tenants) {
    const migrator = createSchemaMigrator(sequelize, tenant.schemaName, tenantMigrations);
    const applied = await migrator.up();
    console.log(`${tenant.slug}: applied ${applied.length} migration(s)`, applied.map((m) => m.name));
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `api/package.json` `scripts`:
```json
"migrate:tenants": "ts-node -r tsconfig-paths/register src/database/scripts/migrate-tenants.ts"
```

- [ ] **Step 11: Run full backend test suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add api/src/database api/src/tenancy api/src/common api/package.json
git commit -m "feat(api): tenant schema migrations and transactional tenant provisioning"
```

---

## Task 5: Keycloak admin service + idempotent realm bootstrap script

**Files:**
- Create: `api/src/keycloak/keycloak-admin.service.ts`
- Create: `api/src/keycloak/keycloak.module.ts`
- Create: `api/src/keycloak/bootstrap-realm.ts`
- Modify: `api/package.json` (add `keycloak:bootstrap` script)
- Test: `api/src/keycloak/keycloak-admin.service.spec.ts`

**Interfaces:**
- Produces: `KeycloakAdminService` with methods `getAdminToken()`, `ensureRealmRole(name)`, `ensureUserAttributeMapper()`, `createUser({ email, tenantId, temporaryPassword }): Promise<{ id: string }>`, `assignRealmRole(userId, roleName)`, `ensureTenantGroup(tenantSlug): Promise<{ id: string }>`, `addUserToGroup(userId, groupId)`. Reused by `bootstrap-realm.ts` (this task), `UsersController`/`UsersService` (Task 9), and `seed-demo.ts` (Task 14).
- Consumes: `KEYCLOAK_ADMIN_BASE_URL`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` from `ConfigService` (Task 2).

- [ ] **Step 1: Write the failing admin-token test**

This test hits the *real* running Keycloak dev instance (`devops/keycloak/docker-compose.yml`, already up on `localhost:8081`) rather than mocking `fetch`, because the whole point of this service is the wire format of Keycloak's admin REST API — a mock would test nothing.

`api/src/keycloak/keycloak-admin.service.spec.ts`:
```ts
import { KeycloakAdminService } from './keycloak-admin.service';

const config = {
  adminBaseUrl: process.env.KEYCLOAK_ADMIN_BASE_URL ?? 'http://localhost:8081',
  adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'adminpassword',
  realm: process.env.KEYCLOAK_REALM ?? 'thingsvu',
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'thingsvu',
};

describe('KeycloakAdminService', () => {
  const service = new KeycloakAdminService(config);

  it('obtains an admin access token from the master realm', async () => {
    const token = await service.getAdminToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  it('ensureRealmRole is idempotent', async () => {
    await service.ensureRealmRole('tenant_user_test_role');
    await expect(service.ensureRealmRole('tenant_user_test_role')).resolves.not.toThrow();
  });

  it('ensureTenantGroup creates a group and returns its id on repeat calls', async () => {
    const first = await service.ensureTenantGroup('spec_test_tenant');
    const second = await service.ensureTenantGroup('spec_test_tenant');
    expect(first.id).toEqual(second.id);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter api test keycloak-admin`
Expected: FAIL — `Cannot find module './keycloak-admin.service'`
(Requires `devops/keycloak/docker-compose.yml` to be running: `docker compose -f devops/keycloak/docker-compose.yml up -d`.)

- [ ] **Step 3: Implement `KeycloakAdminService`**

```ts
export interface KeycloakAdminConfig {
  adminBaseUrl: string;
  adminUsername: string;
  adminPassword: string;
  realm: string;
  clientId: string;
}

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakGroup {
  id: string;
  name: string;
}

export class KeycloakAdminService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: KeycloakAdminConfig) {}

  async getAdminToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const res = await fetch(`${this.config.adminBaseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: this.config.adminUsername,
        password: this.config.adminPassword,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to obtain Keycloak admin token: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 10) * 1000 };
    return body.access_token;
  }

  private async adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAdminToken();
    return fetch(`${this.config.adminBaseUrl}/admin/realms/${this.config.realm}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async ensureRealmRole(name: string): Promise<KeycloakRole> {
    const existing = await this.adminFetch(`/roles/${encodeURIComponent(name)}`);
    if (existing.ok) {
      return existing.json();
    }
    const created = await this.adminFetch('/roles', { method: 'POST', body: JSON.stringify({ name }) });
    if (!created.ok && created.status !== 409) {
      throw new Error(`Failed to create role ${name}: ${created.status} ${await created.text()}`);
    }
    const fetched = await this.adminFetch(`/roles/${encodeURIComponent(name)}`);
    return fetched.json();
  }

  async ensureTenantGroup(slug: string): Promise<KeycloakGroup> {
    const groupName = `tenant_${slug}`;
    const found = await this.adminFetch(`/groups?search=${encodeURIComponent(groupName)}&exact=true`);
    const foundGroups = (await found.json()) as KeycloakGroup[];
    const existing = foundGroups.find((g) => g.name === groupName);
    if (existing) return existing;

    const created = await this.adminFetch('/groups', { method: 'POST', body: JSON.stringify({ name: groupName }) });
    if (!created.ok && created.status !== 409) {
      throw new Error(`Failed to create group ${groupName}: ${created.status} ${await created.text()}`);
    }
    const refetched = await this.adminFetch(`/groups?search=${encodeURIComponent(groupName)}&exact=true`);
    const refetchedGroups = (await refetched.json()) as KeycloakGroup[];
    const group = refetchedGroups.find((g) => g.name === groupName);
    if (!group) throw new Error(`Group ${groupName} not found after creation`);
    return group;
  }

  private async getClientInternalId(): Promise<string> {
    const res = await this.adminFetch(`/clients?clientId=${encodeURIComponent(this.config.clientId)}`);
    const clients = (await res.json()) as Array<{ id: string }>;
    if (!clients.length) throw new Error(`Client ${this.config.clientId} not found in realm ${this.config.realm}`);
    return clients[0].id;
  }

  async ensureUserAttributeMapper(): Promise<void> {
    const clientInternalId = await this.getClientInternalId();
    const res = await this.adminFetch(`/clients/${clientInternalId}/protocol-mappers/models`);
    const mappers = (await res.json()) as Array<{ name: string }>;
    if (mappers.some((m) => m.name === 'tenant_id')) return;

    const created = await this.adminFetch(`/clients/${clientInternalId}/protocol-mappers/models`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'tenant_id',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        config: {
          'user.attribute': 'tenant_id',
          'claim.name': 'tenant_id',
          'jsonType.label': 'String',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
        },
      }),
    });
    if (!created.ok) {
      throw new Error(`Failed to create tenant_id mapper: ${created.status} ${await created.text()}`);
    }
  }

  async createUser(input: { email: string; tenantId: string; temporaryPassword: string }): Promise<{ id: string }> {
    const created = await this.adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        enabled: true,
        emailVerified: true,
        attributes: { tenant_id: [input.tenantId] },
        credentials: [{ type: 'password', value: input.temporaryPassword, temporary: true }],
      }),
    });
    if (!created.ok) {
      throw new Error(`Failed to create user ${input.email}: ${created.status} ${await created.text()}`);
    }
    const location = created.headers.get('Location');
    const id = location?.split('/').pop();
    if (!id) throw new Error('Keycloak did not return a Location header for the created user');
    return { id };
  }

  async assignRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.ensureRealmRole(roleName);
    const res = await this.adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    if (!res.ok) {
      throw new Error(`Failed to assign role ${roleName} to user ${userId}: ${res.status} ${await res.text()}`);
    }
  }

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const res = await this.adminFetch(`/users/${userId}/groups/${groupId}`, { method: 'PUT' });
    if (!res.ok) {
      throw new Error(`Failed to add user ${userId} to group ${groupId}: ${res.status} ${await res.text()}`);
    }
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter api test keycloak-admin`
Expected: PASS (3 tests). Clean up the test artifacts afterward if desired (`spec_test_tenant` group and `tenant_user_test_role` role are harmless to leave in a dev realm).

- [ ] **Step 5: Wire the NestJS module**

`api/src/keycloak/keycloak.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KeycloakAdminService } from './keycloak-admin.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KeycloakAdminService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new KeycloakAdminService({
          adminBaseUrl: config.get<string>('KEYCLOAK_ADMIN_BASE_URL')!,
          adminUsername: config.get<string>('KEYCLOAK_ADMIN_USERNAME')!,
          adminPassword: config.get<string>('KEYCLOAK_ADMIN_PASSWORD')!,
          realm: config.get<string>('KEYCLOAK_REALM')!,
          clientId: config.get<string>('KEYCLOAK_CLIENT_ID')!,
        }),
    },
  ],
  exports: [KeycloakAdminService],
})
export class KeycloakModule {}
```

- [ ] **Step 6: Write the one-time bootstrap script**

`api/src/keycloak/bootstrap-realm.ts`:
```ts
import 'dotenv/config';
import { KeycloakAdminService } from './keycloak-admin.service';

async function main() {
  const service = new KeycloakAdminService({
    adminBaseUrl: process.env.KEYCLOAK_ADMIN_BASE_URL!,
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME!,
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD!,
    realm: process.env.KEYCLOAK_REALM!,
    clientId: process.env.KEYCLOAK_CLIENT_ID!,
  });

  for (const role of ['platform_admin', 'tenant_admin', 'tenant_user']) {
    await service.ensureRealmRole(role);
    console.log(`role ensured: ${role}`);
  }

  await service.ensureUserAttributeMapper();
  console.log('tenant_id protocol mapper ensured on client', process.env.KEYCLOAK_CLIENT_ID);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `api/package.json` `scripts`:
```json
"keycloak:bootstrap": "ts-node -r tsconfig-paths/register src/keycloak/bootstrap-realm.ts"
```

- [ ] **Step 7: Run it against the real realm**

Run: `pnpm --filter api run keycloak:bootstrap`
Expected: prints `role ensured: platform_admin`, `role ensured: tenant_admin`, `role ensured: tenant_user`, `tenant_id protocol mapper ensured on client thingsvu`.

Verify in the Keycloak admin console (`http://localhost:8081`, login `admin`/`adminpassword`) → realm `thingsvu` → Realm roles: the three roles exist. → Clients → `thingsvu` → Client scopes → Dedicated scopes → Mappers: `tenant_id` mapper exists.

- [ ] **Step 8: Commit**

```bash
git add api/src/keycloak api/package.json
git commit -m "feat(api): keycloak admin service and idempotent realm bootstrap"
```

---

## Task 6: Redis module + BFF auth (OIDC login/callback/logout/me, sessions, CSRF)

**Files:**
- Create: `api/src/redis/redis.module.ts`
- Create: `api/src/auth/oidc-client.provider.ts`
- Create: `api/src/auth/session.types.ts`
- Create: `api/src/auth/csrf.middleware.ts`
- Create: `api/src/auth/auth.service.ts`
- Create: `api/src/auth/auth.controller.ts`
- Create: `api/src/auth/auth.module.ts`
- Modify: `api/src/main.ts` (mount `express-session`, wire session store)
- Modify: `api/src/app.module.ts`
- Install: `ioredis express-session connect-redis openid-client@^5` (+ `@types/express-session` dev)
- Test: `api/src/auth/csrf.middleware.spec.ts`, `api/test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `REDIS_CLIENT` injection token (an `ioredis` instance) from `RedisModule` — reused by `TenantResolutionMiddleware` (Task 7) for the tenant cache.
- Produces: `SessionUser` type: `{ sub: string; email: string; tenantId: string; roles: string[] }`, stored at `req.session.user`. Every guard from Task 7 onward reads `req.session.user`.
- Produces: `GET /api/v1/auth/login`, `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Produces: CSRF middleware requiring `X-CSRF-Token` header (matching a non-httpOnly `csrf_token` cookie) on `POST/PUT/PATCH/DELETE` to `/api/v1/*` except the auth routes themselves and device-facing `/api/v1/device/*` routes (those use token auth, not cookies, so CSRF doesn't apply).

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter api add ioredis express-session connect-redis openid-client@^5`
Run: `pnpm --filter api add -D @types/express-session`

- [ ] **Step 2: Write `RedisModule`**

`api/src/redis/redis.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
```

- [ ] **Step 3: Write the CSRF middleware and its failing test**

`api/src/auth/csrf.middleware.spec.ts`:
```ts
import { CsrfMiddleware } from './csrf.middleware';
import type { Request, Response } from 'express';

function mockReqRes(opts: { method: string; path: string; cookieToken?: string; headerToken?: string }) {
  const req = {
    method: opts.method,
    path: opts.path,
    cookies: opts.cookieToken ? { csrf_token: opts.cookieToken } : {},
    headers: opts.headerToken ? { 'x-csrf-token': opts.headerToken } : {},
  } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('CsrfMiddleware', () => {
  const middleware = new CsrfMiddleware();

  it('allows GET requests through without a token', () => {
    const { req, res } = mockReqRes({ method: 'GET', path: '/api/v1/devices' });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows device-facing POST routes through without a CSRF token', () => {
    const { req, res } = mockReqRes({ method: 'POST', path: '/api/v1/device/telemetry' });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a state-changing request with a missing token', () => {
    const { req, res } = mockReqRes({ method: 'POST', path: '/api/v1/devices' });
    const next = jest.fn();
    expect(() => middleware.use(req, res, next)).toThrow();
  });

  it('rejects a state-changing request when header and cookie tokens differ', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/devices',
      cookieToken: 'aaa',
      headerToken: 'bbb',
    });
    const next = jest.fn();
    expect(() => middleware.use(req, res, next)).toThrow();
  });

  it('allows a state-changing request when header and cookie tokens match', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/devices',
      cookieToken: 'aaa',
      headerToken: 'aaa',
    });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter api test csrf.middleware`
Expected: FAIL — `Cannot find module './csrf.middleware'`

- [ ] **Step 5: Implement `csrf.middleware.ts`**

```ts
import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PREFIXES = ['/api/v1/auth/', '/api/v1/device/'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

    const cookieToken = req.cookies?.['csrf_token'];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }
    next();
  }
}
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `pnpm --filter api test csrf.middleware`
Expected: PASS (5 tests)

- [ ] **Step 7: Write session types and the OIDC client provider**

`api/src/auth/session.types.ts`:
```ts
import 'express-session';

export interface SessionUser {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    pkceVerifier?: string;
    oauthState?: string;
  }
}
```

`api/src/auth/oidc-client.provider.ts`:
```ts
import { Issuer, type Client } from 'openid-client';
import { ConfigService } from '@nestjs/config';

export const OIDC_CLIENT = 'OIDC_CLIENT';

export async function createOidcClient(config: ConfigService): Promise<Client> {
  const issuer = await Issuer.discover(config.get<string>('KEYCLOAK_ISSUER')!);
  return new issuer.Client({
    client_id: config.get<string>('KEYCLOAK_CLIENT_ID')!,
    client_secret: config.get<string>('KEYCLOAK_CLIENT_SECRET')!,
    redirect_uris: [`${config.get<string>('APP_BASE_URL')}/api/v1/auth/callback`],
    response_types: ['code'],
  });
}
```

- [ ] **Step 8: Write `AuthService`**

`api/src/auth/auth.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { generators, type Client, type TokenSet } from 'openid-client';
import type { SessionUser } from './session.types';

@Injectable()
export class AuthService {
  buildAuthorizationRequest(client: Client) {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return { url, codeVerifier, state };
  }

  async exchangeCode(
    client: Client,
    params: { code: string; state: string },
    stored: { codeVerifier: string; state: string },
  ): Promise<TokenSet> {
    if (params.state !== stored.state) {
      throw new Error('OAuth state mismatch');
    }
    return client.callback(
      client.metadata.redirect_uris![0],
      { code: params.code, state: params.state },
      { code_verifier: stored.codeVerifier, state: stored.state },
    );
  }

  toSessionUser(tokenSet: TokenSet): SessionUser {
    const claims = tokenSet.claims();
    const realmAccess = (claims['realm_access'] as { roles?: string[] } | undefined) ?? {};
    return {
      sub: claims.sub,
      email: (claims.email as string) ?? '',
      tenantId: (claims['tenant_id'] as string) ?? '',
      roles: realmAccess.roles ?? [],
    };
  }
}
```

- [ ] **Step 9: Write `AuthController`**

`api/src/auth/auth.controller.ts`:
```ts
import { Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Client } from 'openid-client';
import { AuthService } from './auth.service';
import { OIDC_CLIENT } from './oidc-client.provider';
import { Inject } from '@nestjs/common';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    @Inject(OIDC_CLIENT) private readonly client: Client,
  ) {}

  @Get('login')
  login(@Req() req: Request, @Res() res: Response): void {
    const { url, codeVerifier, state } = this.authService.buildAuthorizationRequest(this.client);
    req.session.pkceVerifier = codeVerifier;
    req.session.oauthState = state;
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || !req.session.pkceVerifier || !req.session.oauthState) {
      throw new UnauthorizedException('Missing OAuth callback parameters');
    }

    const tokenSet = await this.authService.exchangeCode(
      this.client,
      { code, state },
      { codeVerifier: req.session.pkceVerifier, state: req.session.oauthState },
    );

    req.session.user = this.authService.toSessionUser(tokenSet);
    delete req.session.pkceVerifier;
    delete req.session.oauthState;

    const csrfToken = randomBytes(24).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
    });

    res.redirect(this.config.get<string>('WEB_BASE_URL')!);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    req.session.destroy(() => {
      res.clearCookie(this.config.get<string>('SESSION_COOKIE_NAME')!);
      res.clearCookie('csrf_token');
      res.status(204).send();
    });
  }

  @Get('me')
  me(@Req() req: Request): { user: Request['session']['user'] } {
    if (!req.session.user) {
      throw new UnauthorizedException();
    }
    return { user: req.session.user };
  }
}
```

- [ ] **Step 10: Write `AuthModule`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OIDC_CLIENT, createOidcClient } from './oidc-client.provider';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OIDC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createOidcClient(config),
    },
  ],
  exports: [OIDC_CLIENT],
})
export class AuthModule {}
```

- [ ] **Step 11: Mount `express-session` + Redis store + CSRF middleware in `main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './redis/redis.module';
import { CsrfMiddleware } from './auth/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const redis = app.get(REDIS_CLIENT);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.use(
    session({
      store: new RedisStore({ client: redis, prefix: 'sess:' }),
      secret: config.get<string>('SESSION_SECRET')!,
      name: config.get<string>('SESSION_COOKIE_NAME')!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.get<string>('NODE_ENV') === 'production',
        maxAge: config.get<number>('SESSION_TTL_SECONDS')! * 1000,
      },
    }),
  );
  app.use(new CsrfMiddleware().use.bind(new CsrfMiddleware()));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: config.get<string>('WEB_BASE_URL'), credentials: true });

  const swaggerConfig = new DocumentBuilder().setTitle('IoT Platform API').setVersion('1.0').build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.get<number>('PORT')!);
}
bootstrap();
```

- [ ] **Step 12: Wire `RedisModule` and `AuthModule` into `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 13: Manual end-to-end login check** (no Keycloak test user exists yet — that lands in Task 9/14, so this is a smoke test of the redirect wiring only)

Run: `pnpm --filter api start:dev`
Visit `http://localhost:3000/api/v1/auth/login` in a browser.
Expected: redirected to `http://localhost:8081/realms/thingsvu/protocol/openid-connect/auth?...` (a Keycloak login page renders). This confirms OIDC discovery + authorization URL construction works end to end.

- [ ] **Step 14: Write an e2e test for the unauthenticated `/me` path**

`api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/auth/me returns 401 when not logged in', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
});
```

Run: `pnpm --filter api run test:e2e`
Expected: PASS. (This test intentionally skips versioning/session/CSRF middleware setup from `main.ts` since `createNestApplication()` in a test module doesn't run `bootstrap()` — the 401 comes from `AuthController.me()`'s own check, which is what's under test.)

- [ ] **Step 15: Commit**

```bash
git add api/src/redis api/src/auth api/src/main.ts api/src/app.module.ts api/test api/package.json pnpm-lock.yaml
git commit -m "feat(api): cookie-session BFF auth against Keycloak (PKCE), CSRF middleware"
```

---

## Task 7: Tenant resolution (subdomain), `TenantGuard`, `RolesGuard`

**A note on local dev hosts:** from this task onward, tenant-scoped routes require a subdomain to resolve a tenant, matching design.md §4.3. In dev this means browsing/curling `http://demo.localhost:3000/...` (API) and, later, `http://demo.localhost:4200` (web) instead of plain `localhost` — modern OSes/browsers resolve `*.localhost` to `127.0.0.1` automatically (RFC 6761); if that doesn't hold on this machine, add `127.0.0.1 demo.localhost` to the Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`, requires admin). Plain `localhost` continues to work for non-tenant-scoped routes (`/api/v1/auth/*`, `/api/v1/tenants` platform-admin routes).

**Files:**
- Create: `api/src/tenancy/tenant-context.ts`
- Create: `api/src/tenancy/tenant-resolution.middleware.ts`
- Create: `api/src/tenancy/tenant.guard.ts`
- Create: `api/src/common/roles.decorator.ts`
- Create: `api/src/common/roles.guard.ts`
- Create: `api/src/common/current-user.decorator.ts`
- Modify: `api/src/tenancy/tenancy.module.ts`
- Modify: `api/src/app.module.ts` (implement `NestModule.configure` to mount the middleware globally)
- Test: `api/src/tenancy/tenant-resolution.middleware.spec.ts`, `api/src/tenancy/tenant.guard.spec.ts`, `api/src/common/roles.guard.spec.ts`

**Interfaces:**
- Produces: `TenantContext.get(): { tenantId, schemaName, slug } | undefined` and `TenantContext.getOrThrow()` — every tenant-scoped service from Task 9 onward calls `TenantContext.getOrThrow().schemaName` to bind `Model.schema(...)`.
- Produces: `TenantGuard` (apply via `@UseGuards(TenantGuard)`) and `RolesGuard` + `@Roles(...roles)` decorator, and `@CurrentUser()` param decorator returning `SessionUser`. Reused by every controller in Tasks 8–13.
- Consumes: `REDIS_CLIENT` (Task 6), `ControlTenant` (Task 3), `SessionUser` (Task 6).

- [ ] **Step 1: Write `tenant-context.ts`**

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextValue {
  tenantId: string;
  schemaName: string;
  slug: string;
}

const storage = new AsyncLocalStorage<TenantContextValue>();

export const TenantContext = {
  run<T>(value: TenantContextValue, fn: () => T): T {
    return storage.run(value, fn);
  },
  get(): TenantContextValue | undefined {
    return storage.getStore();
  },
  getOrThrow(): TenantContextValue {
    const value = storage.getStore();
    if (!value) throw new Error('No tenant context set for this request');
    return value;
  },
};
```

- [ ] **Step 2: Write the failing middleware test (subdomain extraction only — the Redis/DB lookup path is covered by Task 18's manual e2e run)**

`api/src/tenancy/tenant-resolution.middleware.spec.ts`:
```ts
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';

describe('TenantResolutionMiddleware.extractSlug', () => {
  const middleware = new TenantResolutionMiddleware({} as any);

  it('extracts the slug from a tenant subdomain', () => {
    expect((middleware as any).extractSlug('demo.localhost')).toBe('demo');
  });

  it('returns null for a bare host', () => {
    expect((middleware as any).extractSlug('localhost')).toBeNull();
  });

  it('returns null for a www subdomain', () => {
    expect((middleware as any).extractSlug('www.example.com')).toBeNull();
  });

  it('extracts the slug from a production-style host', () => {
    expect((middleware as any).extractSlug('acme.platform.example.com')).toBe('acme');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test tenant-resolution` → FAIL (module not found).

`api/src/tenancy/tenant-resolution.middleware.ts`:
```ts
import { Inject, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantContext } from './tenant-context';

interface CachedTenant {
  id: string;
  schemaName: string;
  status: string;
}

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = this.extractSlug(req.hostname);
    if (!slug) {
      next();
      return;
    }

    const tenant = await this.lookupTenant(slug);
    if (!tenant) {
      throw new NotFoundException(`Unknown tenant "${slug}"`);
    }
    if (tenant.status !== 'active') {
      throw new NotFoundException(`Tenant "${slug}" is not active`);
    }

    TenantContext.run({ tenantId: tenant.id, schemaName: tenant.schemaName, slug }, () => next());
  }

  private async lookupTenant(slug: string): Promise<CachedTenant | null> {
    const cacheKey = `tenant:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CachedTenant;

    const record = await ControlTenant.findOne({ where: { slug } });
    if (!record) return null;

    const value: CachedTenant = { id: record.id, schemaName: record.schemaName, status: record.status };
    await this.redis.set(cacheKey, JSON.stringify(value), 'EX', 60);
    return value;
  }

  private extractSlug(hostname: string): string | null {
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    if (parts[0] === 'www') return null;
    return parts[0];
  }
}
```

Run: `pnpm --filter api test tenant-resolution` → PASS (4 tests)

- [ ] **Step 4: Write the failing `TenantGuard` test**

`api/src/tenancy/tenant.guard.spec.ts`:
```ts
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantContext } from './tenant-context';

function contextWithSession(sessionUser?: { tenantId: string }): ExecutionContext {
  const req = { session: { user: sessionUser } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const guard = new TenantGuard();

  it('allows the request when the session tenantId matches the resolved tenant', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-1' });
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  it('rejects when no tenant was resolved for this request', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated session', () => {
    const ctx = contextWithSession(undefined);
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  it('rejects when the session tenantId does not match the resolved tenant', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-OTHER' });
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 5: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test tenant.guard` → FAIL (module not found).

`api/src/tenancy/tenant.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const tenant = TenantContext.get();

    if (!tenant) {
      throw new ForbiddenException('This route requires a tenant subdomain');
    }
    if (!req.session.user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (req.session.user.tenantId !== tenant.tenantId) {
      throw new ForbiddenException('Resolved tenant does not match your session');
    }
    return true;
  }
}
```

Run: `pnpm --filter api test tenant.guard` → PASS (4 tests)

- [ ] **Step 6: Write the failing `RolesGuard` test**

`api/src/common/roles.guard.spec.ts`:
```ts
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWithRoles(roles: string[] | undefined, required: string[]): ExecutionContext {
  const req = { session: { user: roles ? { roles } : undefined } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => (() => required),
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return ctx;
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithRoles(['tenant_user'], []))).toBe(true);
  });

  it('allows the request when the user has a required role', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithRoles(['tenant_admin', 'tenant_user'], ['tenant_admin']))).toBe(true);
  });

  it('rejects when the user lacks a required role', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithRoles(['tenant_user'], ['tenant_admin']))).toThrow(ForbiddenException);
  });

  it('rejects when there is no session at all', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithRoles(undefined, ['tenant_admin']))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 7: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test roles.guard` → FAIL (module not found).

`api/src/common/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`api/src/common/roles.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session.user) throw new UnauthorizedException();

    const hasRole = req.session.user.roles.some((r) => required.includes(r));
    if (!hasRole) throw new ForbiddenException(`Requires one of roles: ${required.join(', ')}`);
    return true;
  }
}
```

`api/src/common/current-user.decorator.ts`:
```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../auth/session.types';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.session.user;
});
```

Run: `pnpm --filter api test roles.guard` → PASS (4 tests)

- [ ] **Step 8: Mount `TenantResolutionMiddleware` globally**

Update `api/src/tenancy/tenancy.module.ts` to export the middleware class (Nest DI needs it provided somewhere it can resolve `REDIS_CLIENT`):
```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import { TenantGuard } from './tenant.guard';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [TenantProvisioningService, TenantResolutionMiddleware, TenantGuard],
  exports: [TenantProvisioningService, TenantResolutionMiddleware, TenantGuard],
})
export class TenancyModule {}
```

Update `api/src/app.module.ts` to implement `NestModule` and apply the middleware to every route:
```ts
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantResolutionMiddleware } from './tenancy/tenant-resolution.middleware';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, AuthModule, TenancyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 9: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add api/src/tenancy api/src/common api/src/app.module.ts
git commit -m "feat(api): subdomain tenant resolution, TenantGuard, RolesGuard"
```

---

## Task 8: Tenants API (`platform_admin`)

**Files:**
- Create: `api/src/tenants/dto/create-tenant.dto.ts`
- Create: `api/src/tenants/dto/update-tenant.dto.ts`
- Create: `api/src/tenants/tenants.service.ts`
- Create: `api/src/tenants/tenants.controller.ts`
- Create: `api/src/tenants/tenants.module.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/src/tenants/tenants.controller.spec.ts`

**Interfaces:**
- Consumes: `TenantProvisioningService.provision` (Task 4), `ControlTenant` model (Task 3), `RolesGuard`/`@Roles` (Task 7).
- Produces: `GET/POST /api/v1/tenants`, `GET/PATCH /api/v1/tenants/:id`, all guarded by `@Roles('platform_admin')`. Not tenant-scoped (no `TenantGuard`) — these operate on the control plane.

- [ ] **Step 1: Write the DTOs**

`api/src/tenants/dto/create-tenant.dto.ts`:
```ts
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,30}$/, {
    message: 'slug must start with a lowercase letter and contain only lowercase letters, digits, underscores',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
```

`api/src/tenants/dto/update-tenant.dto.ts`:
```ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
```

- [ ] **Step 2: Write `TenantsService`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantProvisioningService } from '../tenancy/tenant-provisioning.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly provisioning: TenantProvisioningService) {}

  create(dto: CreateTenantDto) {
    return this.provisioning.provision(dto);
  }

  findAll() {
    return ControlTenant.findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<ControlTenant> {
    const tenant = await ControlTenant.findByPk(id);
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<ControlTenant> {
    const tenant = await this.findOne(id);
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.status !== undefined) tenant.status = dto.status;
    await tenant.save();
    return tenant;
  }
}
```

- [ ] **Step 3: Write the failing controller test**

`api/src/tenants/tenants.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(TenantsController);
  });

  it('delegates creation to the service', async () => {
    service.create.mockResolvedValue({ id: 't1', slug: 'acme', name: 'Acme', schemaName: 'tenant_acme', status: 'active' });
    const result = await controller.create({ slug: 'acme', name: 'Acme' });
    expect(service.create).toHaveBeenCalledWith({ slug: 'acme', name: 'Acme' });
    expect(result.slug).toBe('acme');
  });

  it('delegates listing to the service', async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });

  it('delegates update to the service', async () => {
    service.update.mockResolvedValue({ id: 't1', status: 'suspended' });
    await controller.update('t1', { status: 'suspended' });
    expect(service.update).toHaveBeenCalledWith('t1', { status: 'suspended' });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test tenants.controller` → FAIL (module not found).

`api/src/tenants/tenants.controller.ts`:
```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller({ path: 'tenants', version: '1' })
@UseGuards(RolesGuard)
@Roles('platform_admin')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }
}
```

Run: `pnpm --filter api test tenants.controller` → PASS (3 tests)

- [ ] **Step 5: Write `TenantsModule` and wire it into `app.module.ts`**

`api/src/tenants/tenants.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TenancyModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
```

Add `TenantsModule` to `AppModule`'s `imports` array (alongside the modules from Task 7).

- [ ] **Step 6: Manual verification**

Run: `pnpm --filter api start:dev`
Run: `curl -X POST http://localhost:3000/api/v1/tenants -H "Content-Type: application/json" -d '{"slug":"demo","name":"Demo Tenant"}'`
Expected: `403 Forbidden` (no session yet — there's no way to authenticate as `platform_admin` until Task 9's Keycloak user flow exists; this confirms the guard is active). Full happy-path creation of the demo tenant is exercised for real in Task 14's seed script, which calls `TenantsService`/`TenantProvisioningService` directly, bypassing HTTP for the one-time bootstrap.

- [ ] **Step 7: Commit**

```bash
git add api/src/tenants api/src/app.module.ts
git commit -m "feat(api): platform_admin tenants CRUD API"
```

---

## Task 9: Users API (`tenant_admin`) — Keycloak user creation + `user_profiles` mirror

**Scope note:** Keycloak group assignment (`ensureTenantGroup`/`addUserToGroup` from Task 5) is intentionally **not** called here — per the plan's Deviation #2, the `tenant_id` token claim comes from a user attribute set directly on the Keycloak user at creation time, so group membership isn't required for auth correctness. Groups remain available in `KeycloakAdminService` for later phases.

**Files:**
- Create: `api/src/users/dto/create-user.dto.ts`
- Create: `api/src/users/dto/update-user.dto.ts`
- Create: `api/src/users/users.service.ts`
- Create: `api/src/users/users.controller.ts`
- Create: `api/src/users/users.module.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `KeycloakAdminService.createUser`/`assignRealmRole` (Task 5), `UserProfile` model (Task 4), `TenantContext.getOrThrow()` (Task 7), `TenantGuard`/`RolesGuard` (Task 7).
- Produces: `GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/:id`, guarded by `TenantGuard` + `@Roles('tenant_admin')`. `POST` returns the created profile plus a one-time `temporaryPassword`.

- [ ] **Step 1: Write the DTOs**

`api/src/users/dto/create-user.dto.ts`:
```ts
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsIn(['tenant_admin', 'tenant_user'])
  role!: 'tenant_admin' | 'tenant_user';
}
```

`api/src/users/dto/update-user.dto.ts`:
```ts
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsIn(['tenant_admin', 'tenant_user'])
  role?: 'tenant_admin' | 'tenant_user';

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
```

- [ ] **Step 2: Write the failing service test**

`api/src/users/users.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import { UsersService } from './users.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { UserProfile } from '../database/models/tenant/user-profile.model';
import { TenantContext } from '../tenancy/tenant-context';

describe('UsersService', () => {
  let sequelize: Sequelize;
  let service: UsersService;
  const schema = 'test_users_schema';
  const keycloakAdmin = {
    createUser: jest.fn(),
    assignRealmRole: jest.fn(),
  };

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE "${schema}".user_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_sub text UNIQUE NOT NULL,
        email text NOT NULL,
        display_name text,
        role text NOT NULL DEFAULT 'tenant_user',
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    UserProfile.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: KeycloakAdminService, useValue: keycloakAdmin }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('creates a Keycloak user, assigns the role, and mirrors a user_profile row', async () => {
    keycloakAdmin.createUser.mockResolvedValue({ id: 'kc-sub-1' });
    keycloakAdmin.assignRealmRole.mockResolvedValue(undefined);

    const result = await TenantContext.run(
      { tenantId: 'tenant-1', schemaName: schema, slug: 'demo' },
      () => service.create({ email: 'admin@demo.test', role: 'tenant_admin' }),
    );

    expect(keycloakAdmin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@demo.test', tenantId: 'tenant-1' }),
    );
    expect(keycloakAdmin.assignRealmRole).toHaveBeenCalledWith('kc-sub-1', 'tenant_admin');
    expect(result.profile.email).toBe('admin@demo.test');
    expect(result.profile.keycloakSub).toBe('kc-sub-1');
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter api test users.service`
Expected: FAIL — `Cannot find module './users.service'`

- [ ] **Step 4: Implement `UsersService`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { UserProfile } from '../database/models/tenant/user-profile.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

@Injectable()
export class UsersService {
  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  private scopedModel() {
    const { schemaName } = TenantContext.getOrThrow();
    return UserProfile.schema(schemaName);
  }

  async create(dto: CreateUserDto): Promise<{ profile: UserProfile; temporaryPassword: string }> {
    const { tenantId } = TenantContext.getOrThrow();
    const temporaryPassword = generateTemporaryPassword();

    const kcUser = await this.keycloakAdmin.createUser({
      email: dto.email,
      tenantId,
      temporaryPassword,
    });
    await this.keycloakAdmin.assignRealmRole(kcUser.id, dto.role);

    const profile = await this.scopedModel().create({
      keycloakSub: kcUser.id,
      email: dto.email,
      displayName: dto.displayName ?? null,
      role: dto.role,
      status: 'active',
    });

    return { profile: profile as UserProfile, temporaryPassword };
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<UserProfile> {
    const profile = await this.scopedModel().findByPk(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);
    return profile as UserProfile;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserProfile> {
    const profile = await this.findOne(id);
    if (dto.displayName !== undefined) profile.displayName = dto.displayName;
    if (dto.role !== undefined) profile.role = dto.role;
    if (dto.status !== undefined) profile.status = dto.status;
    await profile.save();
    return profile;
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    profile.status = 'disabled';
    await profile.save();
  }
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `pnpm --filter api test users.service`
Expected: PASS (1 test)

- [ ] **Step 6: Write `UsersController` and `UsersModule`**

`api/src/users/users.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
@Roles('tenant_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
```

`api/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [KeycloakModule, TenancyModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

Add `UsersModule` to `AppModule`'s `imports`.

- [ ] **Step 7: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/users api/src/app.module.ts
git commit -m "feat(api): tenant_admin users CRUD backed by Keycloak + user_profiles"
```

---

## Task 10: Device profiles + Devices CRUD

**Files:**
- Create: `api/src/device-profiles/dto/create-device-profile.dto.ts`
- Create: `api/src/device-profiles/device-profiles.service.ts`
- Create: `api/src/device-profiles/device-profiles.controller.ts`
- Create: `api/src/device-profiles/device-profiles.module.ts`
- Create: `api/src/devices/dto/create-device.dto.ts`
- Create: `api/src/devices/devices.service.ts`
- Create: `api/src/devices/devices.controller.ts`
- Create: `api/src/devices/devices.module.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/src/devices/devices.service.spec.ts`

**Interfaces:**
- Consumes: `DeviceProfile`, `Device` models (Task 4), `TenantContext` (Task 7), `TenantGuard`/`RolesGuard` (Task 7).
- Produces: `GET/POST /api/v1/device-profiles`, `GET/PATCH/DELETE /api/v1/device-profiles/:id`; `GET/POST /api/v1/devices`, `GET/PATCH/DELETE /api/v1/devices/:id` — all `TenantGuard` + `@Roles('tenant_admin', 'tenant_user')` for reads, `@Roles('tenant_admin')` for writes.
- Produces: `DevicesService.scopedModel()` pattern reused identically by `DeviceCredentialsService` (Task 11).

- [ ] **Step 1: Write the device-profile DTO and service**

`api/src/device-profiles/dto/create-device-profile.dto.ts`:
```ts
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeviceProfileDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(['mqtt', 'http', 'default'])
  transport?: 'mqtt' | 'http' | 'default';

  @IsOptional()
  @IsIn(['access_token', 'mqtt_basic'])
  provisionType?: 'access_token' | 'mqtt_basic';

  @IsOptional()
  @IsObject()
  defaultAttributes?: Record<string, unknown>;
}
```

`api/src/device-profiles/device-profiles.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceProfile } from '../database/models/tenant/device-profile.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateDeviceProfileDto } from './dto/create-device-profile.dto';

@Injectable()
export class DeviceProfilesService {
  private scopedModel() {
    return DeviceProfile.schema(TenantContext.getOrThrow().schemaName);
  }

  create(dto: CreateDeviceProfileDto) {
    return this.scopedModel().create({
      name: dto.name,
      transport: dto.transport ?? 'http',
      provisionType: dto.provisionType ?? 'access_token',
      defaultAttributes: dto.defaultAttributes ?? {},
    });
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<DeviceProfile> {
    const profile = await this.scopedModel().findByPk(id);
    if (!profile) throw new NotFoundException(`Device profile ${id} not found`);
    return profile as DeviceProfile;
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    await profile.destroy();
  }
}
```

`api/src/device-profiles/device-profiles.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CreateDeviceProfileDto } from './dto/create-device-profile.dto';
import { DeviceProfilesService } from './device-profiles.service';

@Controller({ path: 'device-profiles', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
export class DeviceProfilesController {
  constructor(private readonly service: DeviceProfilesService) {}

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateDeviceProfileDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('tenant_admin', 'tenant_user')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles('tenant_admin', 'tenant_user')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @Roles('tenant_admin')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

`api/src/device-profiles/device-profiles.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DeviceProfilesController } from './device-profiles.controller';
import { DeviceProfilesService } from './device-profiles.service';

@Module({
  imports: [TenancyModule],
  controllers: [DeviceProfilesController],
  providers: [DeviceProfilesService],
  exports: [DeviceProfilesService],
})
export class DeviceProfilesModule {}
```

- [ ] **Step 2: Write the failing `DevicesService` test**

`api/src/devices/devices.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import { DevicesService } from './devices.service';
import { Device } from '../database/models/tenant/device.model';
import { DeviceProfile } from '../database/models/tenant/device-profile.model';
import { TenantContext } from '../tenancy/tenant-context';

describe('DevicesService', () => {
  let sequelize: Sequelize;
  let service: DevicesService;
  const schema = 'test_devices_schema';

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE "${schema}".device_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        transport text NOT NULL DEFAULT 'http', provision_type text NOT NULL DEFAULT 'access_token',
        telemetry_keys jsonb NOT NULL DEFAULT '[]', default_attributes jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        device_profile_id uuid REFERENCES "${schema}".device_profiles(id),
        label text, status text NOT NULL DEFAULT 'active', last_seen_at timestamptz, firmware_version text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    DeviceProfile.initModel(sequelize);
    Device.initModel(sequelize);

    const moduleRef = await Test.createTestingModule({ providers: [DevicesService] }).compile();
    service = moduleRef.get(DevicesService);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.close();
  });

  it('creates a device scoped to the current tenant schema', async () => {
    const device = await TenantContext.run(
      { tenantId: 't1', schemaName: schema, slug: 'demo' },
      () => service.create({ name: 'Sensor 1' }),
    );
    expect(device.name).toBe('Sensor 1');
    expect(device.status).toBe('active');

    const found = await TenantContext.run(
      { tenantId: 't1', schemaName: schema, slug: 'demo' },
      () => service.findOne(device.id),
    );
    expect(found.id).toBe(device.id);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter api test devices.service`
Expected: FAIL — `Cannot find module './devices.service'`

- [ ] **Step 4: Implement `devices.service.ts`, controller, module**

`api/src/devices/dto/create-device.dto.ts`:
```ts
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  deviceProfileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
```

`api/src/devices/devices.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '../database/models/tenant/device.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  scopedModel() {
    return Device.schema(TenantContext.getOrThrow().schemaName);
  }

  create(dto: CreateDeviceDto) {
    return this.scopedModel().create({
      name: dto.name,
      deviceProfileId: dto.deviceProfileId ?? null,
      label: dto.label ?? null,
      status: 'active',
    });
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.scopedModel().findByPk(id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device as Device;
  }

  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);
    await device.destroy();
  }
}
```

`api/src/devices/devices.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DevicesService } from './devices.service';

@Controller({ path: 'devices', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Get()
  @Roles('tenant_admin', 'tenant_user')
  findAll() {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @Roles('tenant_admin', 'tenant_user')
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Delete(':id')
  @Roles('tenant_admin')
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
```

`api/src/devices/devices.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [TenancyModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
```

Add `DeviceProfilesModule` and `DevicesModule` to `AppModule`'s `imports`.

- [ ] **Step 5: Run it to confirm it passes**

Run: `pnpm --filter api test devices.service`
Expected: PASS (1 test)

- [ ] **Step 6: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/device-profiles api/src/devices api/src/app.module.ts
git commit -m "feat(api): device profiles and devices CRUD"
```

---

## Task 11: Device credential issuance (access-token method) + `control.device_token_index`

**Files:**
- Create: `api/src/common/device-token.util.ts`
- Create: `api/src/devices/device-credentials.service.ts`
- Create: `api/src/devices/device-credentials.controller.ts`
- Modify: `api/src/devices/devices.module.ts`
- Test: `api/src/common/device-token.util.spec.ts`, `api/src/devices/device-credentials.service.spec.ts`

**Interfaces:**
- Produces: `hashDeviceToken(token: string, secret: string): string` — reused by `IngestionService`'s `DeviceTokenGuard` (Task 12) to hash an inbound `X-Device-Token` header the same way, for equality comparison against `control.device_token_index.token_hash`.
- Produces: `DeviceCredentialsService.issueAccessToken(deviceId): Promise<{ token: string; credential: DeviceCredential }>` — `token` is returned **once**, never persisted in plaintext.
- Produces: `POST /api/v1/devices/:deviceId/credentials` (issue/rotate, `tenant_admin`), `GET /api/v1/devices/:deviceId/credentials` (metadata only, `tenant_admin`).
- Consumes: `DevicesService.findOne` (Task 10, to 404 on an unknown device before issuing), `ControlDeviceTokenIndex` (Task 3), `DeviceCredential` model (Task 4).

- [ ] **Step 1: Write the failing hashing test**

`api/src/common/device-token.util.spec.ts`:
```ts
import { hashDeviceToken } from './device-token.util';

describe('hashDeviceToken', () => {
  it('is deterministic for the same token and secret', () => {
    const a = hashDeviceToken('abc123', 'pepper');
    const b = hashDeviceToken('abc123', 'pepper');
    expect(a).toBe(b);
  });

  it('produces a different hash for a different secret', () => {
    const a = hashDeviceToken('abc123', 'pepper-1');
    const b = hashDeviceToken('abc123', 'pepper-2');
    expect(a).not.toBe(b);
  });

  it('never returns the plaintext token', () => {
    const hash = hashDeviceToken('abc123', 'pepper');
    expect(hash).not.toContain('abc123');
    expect(hash).toHaveLength(64); // hex-encoded sha256
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement**

Run: `pnpm --filter api test device-token.util` → FAIL (module not found).

`api/src/common/device-token.util.ts`:
```ts
import { createHmac } from 'node:crypto';

export function hashDeviceToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
```

Run: `pnpm --filter api test device-token.util` → PASS (3 tests)

- [ ] **Step 3: Write the failing `DeviceCredentialsService` test**

`api/src/devices/device-credentials.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { DeviceCredentialsService } from './device-credentials.service';
import { DevicesService } from './devices.service';
import { Device } from '../database/models/tenant/device.model';
import { DeviceCredential } from '../database/models/tenant/device-credential.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantContext } from '../tenancy/tenant-context';
import { hashDeviceToken } from '../common/device-token.util';

describe('DeviceCredentialsService', () => {
  let sequelize: Sequelize;
  let service: DeviceCredentialsService;
  const schema = 'test_credentials_schema';
  const secret = 'test-pepper';
  let tenantId: string;
  let deviceId: string;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS control.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, name text NOT NULL,
        schema_name text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'active', keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS control.device_token_index (
        token_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES control.tenants(id),
        device_id uuid NOT NULL, credential_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, device_profile_id uuid,
        label text, status text NOT NULL DEFAULT 'active', last_seen_at timestamptz, firmware_version text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}".device_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid UNIQUE NOT NULL REFERENCES "${schema}".devices(id),
        credential_type text NOT NULL, token_hash text UNIQUE, mqtt_username text, mqtt_password_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    ControlTenant.initModel(sequelize);
    ControlDeviceTokenIndex.initModel(sequelize);
    Device.initModel(sequelize);
    DeviceCredential.initModel(sequelize);

    const tenant = await ControlTenant.create({ slug: 'credtest', name: 'Cred Test', schemaName: schema, status: 'active' });
    tenantId = tenant.id;
    const device = await Device.schema(schema).create({ name: 'Sensor', status: 'active' });
    deviceId = device.id;

    const config = { get: (key: string) => (key === 'DEVICE_TOKEN_HASH_SECRET' ? secret : undefined) } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceCredentialsService,
        { provide: DevicesService, useValue: { findOne: jest.fn().mockResolvedValue({ id: deviceId }) } },
        { provide: ConfigService, useValue: config },
        { provide: getConnectionToken(), useValue: sequelize },
      ],
    }).compile();
    service = moduleRef.get(DeviceCredentialsService);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query('DROP SCHEMA IF EXISTS control CASCADE');
    await sequelize.close();
  });

  it('issues a token, stores only its hash, and indexes it in control.device_token_index', async () => {
    const { token, credential } = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );

    expect(credential.get('tokenHash')).toBe(hashDeviceToken(token, secret));
    expect(credential.get('tokenHash')).not.toBe(token);

    const indexRow = await ControlDeviceTokenIndex.findByPk(hashDeviceToken(token, secret));
    expect(indexRow?.get('deviceId')).toBe(deviceId);
    expect(indexRow?.get('tenantId')).toBe(tenantId);
  });

  it('rotating the token removes the old index entry', async () => {
    const first = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );
    const second = await TenantContext.run(
      { tenantId, schemaName: schema, slug: 'credtest' },
      () => service.issueAccessToken(deviceId),
    );

    const oldIndexRow = await ControlDeviceTokenIndex.findByPk(hashDeviceToken(first.token, secret));
    const newIndexRow = await ControlDeviceTokenIndex.findByPk(hashDeviceToken(second.token, secret));
    expect(oldIndexRow).toBeNull();
    expect(newIndexRow?.get('deviceId')).toBe(deviceId);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter api test device-credentials.service`
Expected: FAIL — `Cannot find module './device-credentials.service'`

- [ ] **Step 5: Implement `DeviceCredentialsService`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/sequelize';
import { randomBytes } from 'node:crypto';
import { Sequelize } from 'sequelize';
import { hashDeviceToken } from '../common/device-token.util';
import { DeviceCredential } from '../database/models/tenant/device-credential.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { TenantContext } from '../tenancy/tenant-context';
import { DevicesService } from './devices.service';

@Injectable()
export class DeviceCredentialsService {
  constructor(
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
    @Inject(getConnectionToken()) private readonly sequelize: Sequelize,
  ) {}

  async issueAccessToken(deviceId: string): Promise<{ token: string; credential: DeviceCredential }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await this.devicesService.findOne(deviceId);

    const token = randomBytes(24).toString('base64url');
    const tokenHash = hashDeviceToken(token, this.config.get<string>('DEVICE_TOKEN_HASH_SECRET')!);
    const ScopedCredential = DeviceCredential.schema(schemaName);

    const credential = await this.sequelize.transaction(async (transaction) => {
      const existing = await ScopedCredential.findOne({ where: { deviceId }, transaction });
      if (existing) {
        await ControlDeviceTokenIndex.destroy({
          where: { tokenHash: existing.get('tokenHash') as string },
          transaction,
        });
        await existing.destroy({ transaction });
      }

      const created = await ScopedCredential.create(
        { deviceId, credentialType: 'access_token', tokenHash },
        { transaction },
      );
      await ControlDeviceTokenIndex.create(
        { tokenHash, tenantId, deviceId, credentialType: 'access_token' },
        { transaction },
      );
      return created;
    });

    return { token, credential: credential as DeviceCredential };
  }

  async getMetadata(deviceId: string): Promise<{ credentialType: string; createdAt: Date } | null> {
    const { schemaName } = TenantContext.getOrThrow();
    const credential = await DeviceCredential.schema(schemaName).findOne({ where: { deviceId } });
    if (!credential) return null;
    return {
      credentialType: credential.get('credentialType') as string,
      createdAt: credential.get('createdAt') as Date,
    };
  }
}
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `pnpm --filter api test device-credentials.service`
Expected: PASS (2 tests)

- [ ] **Step 7: Write `DeviceCredentialsController` and wire into `DevicesModule`**

`api/src/devices/device-credentials.controller.ts`:
```ts
import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { DeviceCredentialsService } from './device-credentials.service';

@Controller({ path: 'devices/:deviceId/credentials', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
@Roles('tenant_admin')
export class DeviceCredentialsController {
  constructor(private readonly service: DeviceCredentialsService) {}

  @Post()
  issue(@Param('deviceId') deviceId: string) {
    return this.service.issueAccessToken(deviceId);
  }

  @Get()
  async metadata(@Param('deviceId') deviceId: string) {
    const meta = await this.service.getMetadata(deviceId);
    if (!meta) throw new NotFoundException('No credential issued for this device yet');
    return meta;
  }
}
```

Update `api/src/devices/devices.module.ts` to add the new controller and service:
```ts
import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceCredentialsController } from './device-credentials.controller';
import { DeviceCredentialsService } from './device-credentials.service';

@Module({
  imports: [TenancyModule],
  controllers: [DevicesController, DeviceCredentialsController],
  providers: [DevicesService, DeviceCredentialsService],
  exports: [DevicesService],
})
export class DevicesModule {}
```

- [ ] **Step 8: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add api/src/common/device-token.util.ts api/src/common/device-token.util.spec.ts api/src/devices
git commit -m "feat(api): access-token credential issuance with control-plane token index"
```

---

## Task 12: Device-facing HTTP telemetry ingestion

**Scope note:** only `POST /api/v1/device/telemetry` is built now (design.md §17's Phase 1.1 acceptance test only requires telemetry ingestion). `POST /api/v1/device/attributes` is deferred alongside the attributes UI (Deviation #5).

**Files:**
- Create: `api/src/ingestion/dto/telemetry-payload.dto.ts`
- Create: `api/src/ingestion/device-token.guard.ts`
- Create: `api/src/ingestion/ingestion.service.ts`
- Create: `api/src/ingestion/ingestion.controller.ts`
- Create: `api/src/ingestion/ingestion.module.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/src/ingestion/device-token.guard.spec.ts`, `api/src/ingestion/ingestion.service.spec.ts`

**Interfaces:**
- Consumes: `hashDeviceToken` (Task 11), `ControlDeviceTokenIndex`/`ControlTenant` models (Task 3).
- Produces: `DeviceAuthContext = { tenantId, deviceId, schemaName }`, attached to `req.deviceAuth` by `DeviceTokenGuard` — this is **not** the subdomain-based `TenantContext` from Task 7; device-facing endpoints resolve their tenant purely from the token (a device doesn't know its tenant's subdomain), so this controller does not use `TenantGuard`/`TenantResolutionMiddleware` at all.
- Produces: `POST /api/v1/device/telemetry` (204 No Content on success), writes to `"{schema}".telemetry` + upserts `"{schema}".telemetry_latest` + updates `devices.last_seen_at`. Reused by Task 13's telemetry query endpoints only in the sense that they read the same tables (no shared code).

- [ ] **Step 1: Write the DTO**

`api/src/ingestion/dto/telemetry-payload.dto.ts`:
```ts
import { IsNumber, IsObject, IsOptional } from 'class-validator';

export class TelemetryPayloadDto {
  @IsOptional()
  @IsNumber()
  ts?: number;

  @IsObject()
  values!: Record<string, number | string | boolean | Record<string, unknown>>;
}
```

- [ ] **Step 2: Write the failing `DeviceTokenGuard` test**

`api/src/ingestion/device-token.guard.spec.ts`:
```ts
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize';
import { DeviceTokenGuard } from './device-token.guard';
import { ControlTenant } from '../database/models/control/tenant.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { hashDeviceToken } from '../common/device-token.util';

function contextWithToken(token?: string): ExecutionContext {
  const req: any = { headers: token ? { 'x-device-token': token } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('DeviceTokenGuard', () => {
  let sequelize: Sequelize;
  const secret = 'guard-test-secret';
  const config = { get: () => secret } as unknown as ConfigService;
  const guard = new DeviceTokenGuard(config);
  let tenantId: string;
  let deviceId: string;
  let validToken: string;

  beforeAll(async () => {
    sequelize = new Sequelize(
      process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/iot_platform',
      { logging: false },
    );
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE SCHEMA IF NOT EXISTS control');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS control.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, name text NOT NULL,
        schema_name text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'active', keycloak_group_id text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS control.device_token_index (
        token_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES control.tenants(id),
        device_id uuid NOT NULL, credential_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    ControlTenant.initModel(sequelize);
    ControlDeviceTokenIndex.initModel(sequelize);

    const tenant = await ControlTenant.create({ slug: 'guardtest', name: 'Guard Test', schemaName: 'tenant_guardtest', status: 'active' });
    tenantId = tenant.id;
    deviceId = '11111111-1111-1111-1111-111111111111';
    validToken = 'plaintext-device-token';
    await ControlDeviceTokenIndex.create({
      tokenHash: hashDeviceToken(validToken, secret),
      tenantId,
      deviceId,
      credentialType: 'access_token',
    });
  });

  afterAll(async () => {
    await sequelize.query('DROP SCHEMA IF EXISTS control CASCADE');
    await sequelize.close();
  });

  it('rejects a request with no token header', async () => {
    await expect(guard.canActivate(contextWithToken())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown token', async () => {
    await expect(guard.canActivate(contextWithToken('not-a-real-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches deviceAuth to the request', async () => {
    const ctx = contextWithToken(validToken);
    const req = (ctx.switchToHttp().getRequest as () => any)();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect(req.deviceAuth).toEqual({ tenantId, deviceId, schemaName: 'tenant_guardtest' });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter api test device-token.guard`
Expected: FAIL — `Cannot find module './device-token.guard'`

- [ ] **Step 4: Implement `DeviceTokenGuard`**

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { hashDeviceToken } from '../common/device-token.util';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { ControlTenant } from '../database/models/control/tenant.model';

export interface DeviceAuthContext {
  tenantId: string;
  deviceId: string;
  schemaName: string;
}

@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { deviceAuth?: DeviceAuthContext }>();
    const token = req.headers['x-device-token'];
    if (!token || Array.isArray(token)) {
      throw new UnauthorizedException('Missing X-Device-Token header');
    }

    const tokenHash = hashDeviceToken(token, this.config.get<string>('DEVICE_TOKEN_HASH_SECRET')!);
    const indexRow = await ControlDeviceTokenIndex.findByPk(tokenHash);
    if (!indexRow) {
      throw new UnauthorizedException('Invalid device token');
    }

    const tenant = await ControlTenant.findByPk(indexRow.get('tenantId') as string);
    if (!tenant || tenant.status !== 'active') {
      throw new UnauthorizedException('Tenant is not active');
    }

    req.deviceAuth = {
      tenantId: tenant.id,
      deviceId: indexRow.get('deviceId') as string,
      schemaName: tenant.schemaName,
    };
    return true;
  }
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `pnpm --filter api test device-token.guard`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing `IngestionService` test**

`api/src/ingestion/ingestion.service.spec.ts`:
```ts
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
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `pnpm --filter api test ingestion.service`
Expected: FAIL — `Cannot find module './ingestion.service'`

- [ ] **Step 8: Implement `IngestionService`**

```ts
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
```

- [ ] **Step 9: Run it to confirm it passes**

Run: `pnpm --filter api test ingestion.service`
Expected: PASS (2 tests)

- [ ] **Step 10: Write `IngestionController` and `IngestionModule`**

`api/src/ingestion/ingestion.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DeviceTokenGuard, type DeviceAuthContext } from './device-token.guard';
import { TelemetryPayloadDto } from './dto/telemetry-payload.dto';
import { IngestionService } from './ingestion.service';

@Controller({ path: 'device', version: '1' })
@UseGuards(DeviceTokenGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('telemetry')
  @HttpCode(204)
  async telemetry(@Req() req: Request & { deviceAuth?: DeviceAuthContext }, @Body() dto: TelemetryPayloadDto): Promise<void> {
    await this.ingestionService.ingest(req.deviceAuth!, dto);
  }
}
```

`api/src/ingestion/ingestion.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DeviceTokenGuard } from './device-token.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController],
  providers: [IngestionService, DeviceTokenGuard],
})
export class IngestionModule {}
```

Add `IngestionModule` to `AppModule`'s `imports`.

- [ ] **Step 11: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add api/src/ingestion api/src/app.module.ts
git commit -m "feat(api): HTTP device telemetry ingestion with token auth"
```

---

## Task 13: Telemetry query API (latest values + series) for the UI

**Files:**
- Create: `api/src/telemetry/telemetry.repository.ts`
- Create: `api/src/telemetry/telemetry.controller.ts`
- Create: `api/src/telemetry/telemetry.module.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/src/telemetry/telemetry.repository.spec.ts`

**Interfaces:**
- Produces: `TelemetryRepository.latest(schema, deviceIds, keys?): Promise<LatestPoint[]>`, `.series(schema, { deviceId, key, from, to }): Promise<SeriesPoint[]>` — raw schema-qualified SQL, per design.md §12 ("telemetry uses raw Timescale SQL").
- Produces: `GET /api/v1/telemetry/latest?deviceIds=<csv>&keys=<csv>`, `GET /api/v1/telemetry/series?deviceId=&key=&from=&to=` (ISO 8601 timestamps; defaults to the last 24h). Both `TenantGuard` + `@Roles('tenant_admin','tenant_user')`. Reused directly by the Angular telemetry view (Task 17).

- [ ] **Step 1: Write the failing repository test**

`api/src/telemetry/telemetry.repository.spec.ts`:
```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter api test telemetry.repository`
Expected: FAIL — `Cannot find module './telemetry.repository'`

- [ ] **Step 3: Implement `TelemetryRepository`**

```ts
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
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter api test telemetry.repository`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `TelemetryController` and `TelemetryModule`**

`api/src/telemetry/telemetry.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { TenantContext } from '../tenancy/tenant-context';
import { TelemetryRepository } from './telemetry.repository';

@Controller({ path: 'telemetry', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
@Roles('tenant_admin', 'tenant_user')
export class TelemetryController {
  constructor(private readonly repository: TelemetryRepository) {}

  @Get('latest')
  latest(@Query('deviceIds') deviceIds: string, @Query('keys') keys?: string) {
    const { schemaName } = TenantContext.getOrThrow();
    const deviceIdList = deviceIds.split(',').filter(Boolean);
    const keyList = keys ? keys.split(',').filter(Boolean) : undefined;
    return this.repository.latest(schemaName, deviceIdList, keyList);
  }

  @Get('series')
  series(
    @Query('deviceId') deviceId: string,
    @Query('key') key: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { schemaName } = TenantContext.getOrThrow();
    return this.repository.series(schemaName, {
      deviceId,
      key,
      from: from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000),
      to: to ? new Date(to) : new Date(),
    });
  }
}
```

`api/src/telemetry/telemetry.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryRepository } from './telemetry.repository';

@Module({
  imports: [DatabaseModule, TenancyModule],
  controllers: [TelemetryController],
  providers: [TelemetryRepository],
})
export class TelemetryModule {}
```

Add `TelemetryModule` to `AppModule`'s `imports`.

- [ ] **Step 6: Run the full backend suite**

Run: `pnpm --filter api test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/telemetry api/src/app.module.ts
git commit -m "feat(api): telemetry latest-values and series query endpoints"
```

---

## Task 14: Demo seed script (tenant + tenant_admin + device + token)

This is the design.md §15 local-dev bootstrap, automated: "seed one demo tenant... seed a tenant_admin user and one demo device with an access token."

**Files:**
- Create: `api/src/database/scripts/seed-demo.ts`
- Modify: `api/package.json` (add `seed:demo` script)
- Test: none (this is an idempotent operational script exercised manually; its building blocks — `TenantProvisioningService`, `KeycloakAdminService`, `DevicesService`, `DeviceCredentialsService` — already have unit tests from Tasks 4/5/10/11)

**Interfaces:**
- Consumes: `TenantProvisioningService.provision` (Task 4), `KeycloakAdminService.createUser`/`assignRealmRole` (Task 5), `DevicesService.create` (Task 10), `DeviceCredentialsService.issueAccessToken`/`getMetadata` (Task 11), `UserProfile`/`Device` models (Task 4), `TenantContext.run` (Task 7).
- Produces: a runnable, idempotent `pnpm --filter api run seed:demo` that leaves the system in the exact state Task 18's manual verification checklist assumes.

- [ ] **Step 1: Write `seed-demo.ts`**

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TenantProvisioningService } from '../../tenancy/tenant-provisioning.service';
import { TenantContext } from '../../tenancy/tenant-context';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service';
import { DevicesService } from '../../devices/devices.service';
import { DeviceCredentialsService } from '../../devices/device-credentials.service';
import { ControlTenant } from '../models/control/tenant.model';
import { UserProfile } from '../models/tenant/user-profile.model';
import { Device } from '../models/tenant/device.model';

const DEMO_SLUG = 'demo';
const DEMO_ADMIN_EMAIL = 'admin@demo.test';
const DEMO_ADMIN_PASSWORD = 'DemoPass123!';
const DEMO_DEVICE_NAME = 'Demo Sensor';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const provisioning = app.get(TenantProvisioningService);
  const keycloakAdmin = app.get(KeycloakAdminService);
  const devicesService = app.get(DevicesService);
  const credentialsService = app.get(DeviceCredentialsService);

  let tenant = await ControlTenant.findOne({ where: { slug: DEMO_SLUG } });
  if (!tenant) {
    const provisioned = await provisioning.provision({ slug: DEMO_SLUG, name: 'Demo Tenant' });
    tenant = await ControlTenant.findByPk(provisioned.id);
  }
  if (!tenant) throw new Error('Failed to provision or find the demo tenant');
  console.log(`Tenant ready: ${tenant.slug} (${tenant.schemaName})`);

  await TenantContext.run(
    { tenantId: tenant.id, schemaName: tenant.schemaName, slug: tenant.slug },
    async () => {
      const ScopedUserProfile = UserProfile.schema(tenant!.schemaName);
      let profile = await ScopedUserProfile.findOne({ where: { email: DEMO_ADMIN_EMAIL } });
      if (!profile) {
        const kcUser = await keycloakAdmin.createUser({
          email: DEMO_ADMIN_EMAIL,
          tenantId: tenant!.id,
          temporaryPassword: DEMO_ADMIN_PASSWORD,
        });
        await keycloakAdmin.assignRealmRole(kcUser.id, 'tenant_admin');
        profile = await ScopedUserProfile.create({
          keycloakSub: kcUser.id,
          email: DEMO_ADMIN_EMAIL,
          displayName: 'Demo Admin',
          role: 'tenant_admin',
          status: 'active',
        });
        console.log(`Created demo tenant_admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD} (temporary — Keycloak will prompt a change on first login)`);
      } else {
        console.log(`Demo tenant_admin already exists: ${DEMO_ADMIN_EMAIL}`);
      }

      const ScopedDevice = Device.schema(tenant!.schemaName);
      let device = await ScopedDevice.findOne({ where: { name: DEMO_DEVICE_NAME } });
      if (!device) {
        device = await devicesService.create({ name: DEMO_DEVICE_NAME });
        console.log(`Created demo device: ${device.id}`);
      } else {
        console.log(`Demo device already exists: ${device.id}`);
      }

      const existingCredential = await credentialsService.getMetadata(device.id);
      if (!existingCredential) {
        const { token } = await credentialsService.issueAccessToken(device.id);
        console.log('\n--- Demo device access token (shown once, save it now) ---');
        console.log(token);
        console.log('---\n');
      } else {
        console.log('Demo device already has a credential; delete the device row and re-run to reissue a token.');
      }
    },
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `api/package.json` `scripts`:
```json
"seed:demo": "ts-node -r tsconfig-paths/register src/database/scripts/seed-demo.ts"
```

- [ ] **Step 2: Run the full bootstrap sequence from a clean stack**

```bash
docker compose -f devops/docker-compose.dev.yml up -d
docker compose -f devops/keycloak/docker-compose.yml up -d
pnpm --filter api run migrate:control
pnpm --filter api run keycloak:bootstrap
pnpm --filter api run seed:demo
```
Expected final output includes `Tenant ready: demo (tenant_demo)`, `Created demo tenant_admin: admin@demo.test / DemoPass123! ...`, `Created demo device: <uuid>`, and a printed access token. **Copy the printed token somewhere** — Task 18's manual `curl` verification needs it.

- [ ] **Step 3: Run it again to confirm idempotency**

Run: `pnpm --filter api run seed:demo`
Expected: `Tenant ready: demo (tenant_demo)`, `Demo tenant_admin already exists: admin@demo.test`, `Demo device already exists: <same uuid>`, `Demo device already has a credential; ...` — no duplicate rows, no errors.

- [ ] **Step 4: Commit**

```bash
git add api/src/database/scripts/seed-demo.ts api/package.json
git commit -m "feat(api): idempotent demo tenant/admin/device seed script"
```

---

## Task 15: Frontend core — dev proxy, auth flow, responsive shell, routing

**A note on dev hosts (continued from Task 7):** the Angular dev server must also be reachable at `demo.localhost` so cookies and the proxied `/api` calls share a host with the tenant-scoped backend routes. `web/package.json`'s `start` script is changed to `ng serve --host demo.localhost`; since `demo.localhost` resolves to `127.0.0.1`, this binds the same dev server, just reachable under that hostname. If the dev server rejects the request (a Vite/esbuild "Blocked request" host-check error), add `"allowedHosts": ["demo.localhost"]` next to `proxyConfig` in `angular.json`'s serve options.

**Files:**
- Create: `web/proxy.conf.json`
- Modify: `web/angular.json` (wire `proxyConfig`)
- Modify: `web/package.json` (`start` script)
- Create: `web/src/app/core/models/session.ts`
- Create: `web/src/app/core/models/device.ts`
- Create: `web/src/app/core/models/telemetry.ts`
- Create: `web/src/app/core/auth/auth.service.ts`
- Create: `web/src/app/core/auth/auth.guard.ts`
- Create: `web/src/app/core/http/api.interceptor.ts`
- Create: `web/src/app/layout/shell.ts`
- Create: `web/src/app/features/auth/login-page.ts`
- Modify: `web/src/app/app.config.ts`
- Modify: `web/src/app/app.routes.ts`
- Modify: `web/src/app/app.ts`
- Delete content of: `web/src/app/app.html`, `web/src/app/app.css` (replaced by an inline template on `App`)
- Test: `web/src/app/core/http/api.interceptor.spec.ts`

**Interfaces:**
- Produces: `AuthService` (`user()`, `isAuthenticated()`, `login()`, `logout()`) — consumed by `Shell` (this task) and later by `DevicesListPage`/`TelemetryViewPage` (Tasks 16–17) if they need the current user.
- Produces: `authGuard: CanActivateFn` — applied to the shell route.
- Produces: `apiInterceptor: HttpInterceptorFn` — attaches `X-CSRF-Token` on mutating requests, redirects to the backend login on a 401.
- Consumes: `GET/POST /api/v1/auth/*` from Task 6.

- [ ] **Step 1: Write the dev proxy and wire it into `angular.json`**

`web/proxy.conf.json`:
```json
{
  "/api": {
    "target": "http://localhost:3000",
    "changeOrigin": false,
    "secure": false
  }
}
```

Edit `web/angular.json`, add an `options` block to the `serve` architect target (read the file first, keep all existing keys):
```json
"serve": {
  "builder": "@angular/build:dev-server",
  "options": {
    "proxyConfig": "proxy.conf.json"
  },
  "configurations": {
    "production": { "buildTarget": "web:build:production" },
    "development": { "buildTarget": "web:build:development" }
  },
  "defaultConfiguration": "development"
}
```

Edit `web/package.json`'s `start` script:
```json
"start": "ng serve --host demo.localhost"
```

- [ ] **Step 2: Write the shared model interfaces**

`web/src/app/core/models/session.ts`:
```ts
export interface SessionUser {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
}

export interface MeResponse {
  user: SessionUser;
}
```

`web/src/app/core/models/device.ts`:
```ts
export interface Device {
  id: string;
  name: string;
  deviceProfileId: string | null;
  label: string | null;
  status: string;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`web/src/app/core/models/telemetry.ts`:
```ts
export interface TelemetryPoint {
  device_id: string;
  key: string;
  ts: string;
  value_num: number | null;
  value_str: string | null;
  value_bool: boolean | null;
  value_json: unknown;
}
```

- [ ] **Step 3: Write the failing interceptor test**

`web/src/app/core/http/api.interceptor.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor } from './api.interceptor';

describe('apiInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    document.cookie = 'csrf_token=test-csrf-value; path=/';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the CSRF header to a POST request', () => {
    http.post('/api/v1/devices', { name: 'x' }).subscribe();
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('test-csrf-value');
    req.flush({});
  });

  it('does not attach the CSRF header to a GET request', () => {
    http.get('/api/v1/devices').subscribe();
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush([]);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter web test -- --run api.interceptor`
Expected: FAIL — `Cannot find module './api.interceptor'`

- [ ] **Step 5: Implement `api.interceptor.ts`**

```ts
import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const csrfToken = readCookie('csrf_token');
  const outgoing =
    MUTATING_METHODS.has(req.method) && csrfToken
      ? req.clone({ setHeaders: { 'X-CSRF-Token': csrfToken } })
      : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      const isUnauthorized = typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 401;
      if (isUnauthorized && !req.url.includes('/auth/me')) {
        window.location.href = '/api/v1/auth/login';
      }
      return throwError(() => error);
    }),
  );
};
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `pnpm --filter web test -- --run api.interceptor`
Expected: PASS (2 tests)

- [ ] **Step 7: Write `AuthService`**

If `@Service` is not available in the installed Angular version, use `@Injectable({ providedIn: 'root' })` instead — same effect, just the repo's preferred v22 spelling per `web/.claude/CLAUDE.md`.

`web/src/app/core/auth/auth.service.ts`:
```ts
import { Service, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type { MeResponse } from '../models/session';

@Service()
export class AuthService {
  private readonly meResource = httpResource<MeResponse>(() => '/api/v1/auth/me');

  readonly user = computed(() => this.meResource.value()?.user);
  readonly isAuthenticated = computed(() => this.meResource.value()?.user !== undefined);
  readonly isLoading = this.meResource.isLoading;

  login(): void {
    window.location.href = '/api/v1/auth/login';
  }

  async logout(): Promise<void> {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }
}
```

- [ ] **Step 8: Write `authGuard`**

Implemented as a plain `fetch` check rather than reading `AuthService`'s resource signal, since a route guard runs before any component (and thus before `AuthService`'s resource) has had a chance to resolve — a direct request is simpler than coordinating resource-loading state at the router level.

`web/src/app/core/auth/auth.guard.ts`:
```ts
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
  if (response.ok) return true;
  return router.createUrlTree(['/login']);
};
```

- [ ] **Step 9: Write the login page**

`web/src/app/features/auth/login-page.ts`:
```ts
import { Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [HlmButtonImports],
  template: `
    <div class="flex min-h-dvh items-center justify-center">
      <div class="flex flex-col items-center gap-4 rounded-lg border p-8">
        <h1 class="text-xl font-semibold">Sign in to IoT Platform</h1>
        <button hlmBtn (click)="auth.login()">Sign in with Keycloak</button>
      </div>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
}
```

- [ ] **Step 10: Write the responsive shell**

`web/src/app/layout/shell.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, HlmButtonImports],
  template: `
    <div class="flex h-dvh flex-col">
      <header class="flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-3">
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            class="md:hidden"
            aria-label="Toggle navigation"
            (click)="toggleDrawer()"
          >
            &#9776;
          </button>
          <span class="font-semibold">IoT Platform</span>
        </div>
        <div class="flex items-center gap-3">
          @if (auth.user(); as user) {
            <span class="text-sm text-muted-foreground">{{ user.email }}</span>
          }
          <button hlmBtn variant="outline" size="sm" (click)="auth.logout()">Sign out</button>
        </div>
      </header>
      <div class="flex flex-1 overflow-hidden">
        <nav class="w-56 shrink-0 border-r p-3 md:block" [class.hidden]="!drawerOpen()">
          <a routerLink="/devices" routerLinkActive="font-semibold" class="block rounded px-2 py-1.5 hover:bg-muted">
            Devices
          </a>
          <a routerLink="/telemetry" routerLinkActive="font-semibold" class="block rounded px-2 py-1.5 hover:bg-muted">
            Telemetry
          </a>
        </nav>
        <main class="flex-1 overflow-auto p-4">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly drawerOpen = signal(false);

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }
}
```

- [ ] **Step 11: Wire routes and app config**

`web/src/app/app.routes.ts`:
```ts
import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'devices', pathMatch: 'full' },
      {
        path: 'devices',
        loadComponent: () => import('./features/devices/devices-list.page').then((m) => m.DevicesListPage),
      },
      {
        path: 'telemetry',
        loadComponent: () => import('./features/telemetry/telemetry-view.page').then((m) => m.TelemetryViewPage),
      },
    ],
  },
];
```

(`devices-list.page` and `telemetry-view.page` don't exist until Tasks 16–17 — the app won't compile until then. That's expected; this task ends with a build error that Task 16 resolves, which is fine since they're part of the same plan executed in order. If running this task standalone, stub both with a one-line `template: 'TODO'` component and replace in Tasks 16–17.)

`web/src/app/app.config.ts`:
```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { apiInterceptor } from './core/http/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
  ],
};
```

`web/src/app/app.ts` (replace the placeholder entirely):
```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
```

Delete `web/src/app/app.html` and `web/src/app/app.css` (no longer referenced — `App` now uses an inline template). Check `web/src/app/app.spec.ts`: if it asserts on the placeholder content (e.g. `Hello, web`), update it to just assert the component creates successfully:
```ts
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
```

- [ ] **Step 12: Manual smoke test**

Run backend: `pnpm --filter api start:dev` (in one terminal).
Run frontend: `pnpm --filter web start` (in another).
Visit `http://demo.localhost:4200`.
Expected: redirected to `/login` (via `authGuard`, since there's no session yet), showing the "Sign in with Keycloak" button. Do not click it yet — Tasks 16–17 need to exist first for the post-login redirect target to render anything useful; full login-to-dashboard flow is exercised in Task 18.

- [ ] **Step 13: Commit**

```bash
git add web/proxy.conf.json web/angular.json web/package.json web/src/app/core web/src/app/layout web/src/app/features/auth web/src/app/app.config.ts web/src/app/app.routes.ts web/src/app/app.ts web/src/app/app.spec.ts
git rm web/src/app/app.html web/src/app/app.css
git commit -m "feat(web): auth flow, CSRF interceptor, responsive shell, routing"
```

---

## Task 16: Devices feature — list, create, issue access token

**Scope note on Spartan UI components:** this repo has the full Spartan component library scaffolded in `web/libs/ui`, but the only directive with a *verified* usage example in this codebase is the button (`<button hlmBtn>`, seen in the original `app.html` placeholder). This task uses plain semantic HTML with Tailwind utility classes for the table and text input, rather than guessing at `HlmInputImports`/`HlmTableImports`' exact directive selectors. Swapping those in later is a pure styling upgrade — check `web/libs/ui/input/src/lib/hlm-input.ts` and `web/libs/ui/table/src/lib/hlm-table.ts` for the exact selectors first.

**Files:**
- Create: `web/src/app/features/devices/devices.service.ts`
- Create: `web/src/app/features/devices/devices-list.page.ts`
- Test: `web/src/app/features/devices/devices.service.spec.ts`

**Interfaces:**
- Consumes: `Device` model (Task 15), `GET/POST /api/v1/devices`, `POST /api/v1/devices/:id/credentials` (Tasks 10–11).
- Produces: `DevicesService.devicesResource` (an `httpResource<Device[]>`) — reused by `TelemetryViewPage` (Task 17) for the device picker.

- [ ] **Step 1: Write the failing service test**

`web/src/app/features/devices/devices.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let service: DevicesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DevicesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DevicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs a new device', async () => {
    const promise = firstValueFrom(service.create({ name: 'Sensor 1' }));
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Sensor 1' });
    req.flush({ id: 'd1', name: 'Sensor 1' });
    await expect(promise).resolves.toEqual({ id: 'd1', name: 'Sensor 1' });
  });

  it('POSTs to issue a credential for a device', async () => {
    const promise = firstValueFrom(service.issueCredential('d1'));
    const req = httpMock.expectOne('/api/v1/devices/d1/credentials');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'plaintext-token', credential: { id: 'c1', deviceId: 'd1', credentialType: 'access_token' } });
    await expect(promise).resolves.toEqual(
      expect.objectContaining({ token: 'plaintext-token' }),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter web test -- --run devices.service`
Expected: FAIL — `Cannot find module './devices.service'`

- [ ] **Step 3: Implement `DevicesService`**

```ts
import { Service, inject } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import type { Device } from '../../core/models/device';

export interface CreateDevicePayload {
  name: string;
  deviceProfileId?: string;
  label?: string;
}

export interface IssuedCredential {
  token: string;
  credential: { id: string; deviceId: string; credentialType: string };
}

@Service()
export class DevicesService {
  private readonly http = inject(HttpClient);

  readonly devicesResource = httpResource<Device[]>(() => '/api/v1/devices');

  create(payload: CreateDevicePayload) {
    return this.http.post<Device>('/api/v1/devices', payload);
  }

  issueCredential(deviceId: string) {
    return this.http.post<IssuedCredential>(`/api/v1/devices/${deviceId}/credentials`, {});
  }

  refresh(): void {
    this.devicesResource.reload();
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter web test -- --run devices.service`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `DevicesListPage`**

```ts
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { DevicesService } from './devices.service';

@Component({
  selector: 'app-devices-list-page',
  imports: [HlmButtonImports],
  template: `
    <div class="space-y-6">
      <h1 class="text-lg font-semibold">Devices</h1>

      <div class="flex items-end gap-2">
        <div class="flex flex-col gap-1">
          <label for="device-name" class="text-sm font-medium">New device name</label>
          <input
            id="device-name"
            class="rounded border px-3 py-1.5 text-sm"
            [value]="newDeviceName()"
            (input)="newDeviceName.set($any($event.target).value)"
          />
        </div>
        <button hlmBtn [disabled]="creating() || !newDeviceName().trim()" (click)="createDevice()">
          Create device
        </button>
      </div>

      @if (revealedToken(); as revealed) {
        <div class="rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950">
          <p class="font-medium">Access token for this device (shown once — copy it now):</p>
          <code class="break-all">{{ revealed.token }}</code>
        </div>
      }

      @if (devicesService.devicesResource.value(); as devices) {
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b text-left">
              <th class="py-2">Name</th>
              <th class="py-2">Status</th>
              <th class="py-2">Last seen</th>
              <th class="py-2">Credential</th>
            </tr>
          </thead>
          <tbody>
            @for (device of devices; track device.id) {
              <tr class="border-b">
                <td class="py-2">{{ device.name }}</td>
                <td class="py-2">{{ device.status }}</td>
                <td class="py-2">{{ device.lastSeenAt ?? '—' }}</td>
                <td class="py-2">
                  <button hlmBtn variant="outline" size="sm" (click)="issueToken(device.id)">Issue token</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else if (devicesService.devicesResource.isLoading()) {
        <p>Loading devices…</p>
      } @else {
        <p>No devices yet.</p>
      }
    </div>
  `,
})
export class DevicesListPage {
  protected readonly devicesService = inject(DevicesService);
  protected readonly newDeviceName = signal('');
  protected readonly creating = signal(false);
  protected readonly revealedToken = signal<{ deviceId: string; token: string } | null>(null);

  protected async createDevice(): Promise<void> {
    const name = this.newDeviceName().trim();
    if (!name) return;
    this.creating.set(true);
    try {
      await firstValueFrom(this.devicesService.create({ name }));
      this.newDeviceName.set('');
      this.devicesService.refresh();
    } finally {
      this.creating.set(false);
    }
  }

  protected async issueToken(deviceId: string): Promise<void> {
    const result = await firstValueFrom(this.devicesService.issueCredential(deviceId));
    this.revealedToken.set({ deviceId, token: result.token });
  }
}
```

- [ ] **Step 6: Manual smoke test**

With backend + frontend running and logged in as `admin@demo.test` (Task 18 covers the full login flow), visit `http://demo.localhost:4200/devices`, create a device, click "Issue token", confirm the token renders in the amber callout and the devices table lists the new row.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/features/devices
git commit -m "feat(web): devices list, create, and access-token issuance"
```

---

## Task 17: Minimal telemetry view — latest values table + line chart

**Files:**
- Create: `web/src/app/features/telemetry/telemetry.service.ts`
- Create: `web/src/app/features/telemetry/telemetry-view.page.ts`
- Modify: `web/src/app/app.config.ts` (register the ECharts renderer)
- Install: `echarts ngx-echarts`
- Test: `web/src/app/features/telemetry/telemetry.service.spec.ts`

**Interfaces:**
- Consumes: `TelemetryPoint` model (Task 15), `GET /api/v1/telemetry/latest`/`series` (Task 13), `DevicesService.devicesResource` (Task 16).

**Verify before starting:** `ngx-echarts`'s standalone provider API has changed across major versions. Run `pnpm --filter web add echarts ngx-echarts`, then check the installed `ngx-echarts` version's README/changelog for the current provider function name (this plan assumes `provideEchartsCore`, current as of ngx-echarts v17+) and adjust Step 4 below if it differs.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter web add echarts ngx-echarts`

- [ ] **Step 2: Write the failing service test**

`web/src/app/features/telemetry/telemetry.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TelemetryService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TelemetryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests latest values with a comma-joined deviceIds param', async () => {
    const promise = firstValueFrom(service.latest(['d1', 'd2']));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/telemetry/latest');
    expect(req.request.params.get('deviceIds')).toBe('d1,d2');
    req.flush([]);
    await promise;
  });

  it('requests a series for a device/key pair', async () => {
    const promise = firstValueFrom(service.series('d1', 'temp'));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/telemetry/series');
    expect(req.request.params.get('deviceId')).toBe('d1');
    expect(req.request.params.get('key')).toBe('temp');
    req.flush([]);
    await promise;
  });
});
```

- [ ] **Step 3: Run it to confirm it fails, then implement**

Run: `pnpm --filter web test -- --run telemetry.service` → FAIL (module not found).

`web/src/app/features/telemetry/telemetry.service.ts`:
```ts
import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { TelemetryPoint } from '../../core/models/telemetry';

@Service()
export class TelemetryService {
  private readonly http = inject(HttpClient);

  latest(deviceIds: string[], keys?: string[]) {
    let params = new HttpParams().set('deviceIds', deviceIds.join(','));
    if (keys && keys.length > 0) params = params.set('keys', keys.join(','));
    return this.http.get<TelemetryPoint[]>('/api/v1/telemetry/latest', { params });
  }

  series(deviceId: string, key: string) {
    const params = new HttpParams().set('deviceId', deviceId).set('key', key);
    return this.http.get<TelemetryPoint[]>('/api/v1/telemetry/series', { params });
  }
}
```

Run: `pnpm --filter web test -- --run telemetry.service` → PASS (2 tests)

- [ ] **Step 4: Register the ECharts renderer in `app.config.ts`**

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { apiInterceptor } from './core/http/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideEchartsCore({ echarts: () => import('echarts') }),
  ],
};
```

- [ ] **Step 5: Write `TelemetryViewPage`**

```ts
import { Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { DevicesService } from '../devices/devices.service';
import type { TelemetryPoint } from '../../core/models/telemetry';

@Component({
  selector: 'app-telemetry-view-page',
  imports: [NgxEchartsDirective],
  template: `
    <div class="space-y-4">
      <h1 class="text-lg font-semibold">Telemetry</h1>

      <select
        class="rounded border px-2 py-1 text-sm"
        [value]="selectedDeviceId()"
        (change)="selectedDeviceId.set($any($event.target).value)"
      >
        <option value="" disabled>Select a device</option>
        @for (device of devicesService.devicesResource.value() ?? []; track device.id) {
          <option [value]="device.id">{{ device.name }}</option>
        }
      </select>

      @if (latestResource.value(); as points) {
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b text-left">
              <th class="py-2">Key</th>
              <th class="py-2">Value</th>
              <th class="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            @for (point of points; track point.key) {
              <tr class="border-b">
                <td class="py-2">{{ point.key }}</td>
                <td class="py-2">{{ point.value_num ?? point.value_str ?? point.value_bool }}</td>
                <td class="py-2">{{ point.ts }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (chartOption(); as option) {
        <div echarts [options]="option" class="h-80 w-full"></div>
      }
    </div>
  `,
})
export class TelemetryViewPage {
  protected readonly devicesService = inject(DevicesService);
  protected readonly selectedDeviceId = signal('');

  protected readonly latestResource = httpResource<TelemetryPoint[]>(() => {
    const deviceId = this.selectedDeviceId();
    return deviceId ? `/api/v1/telemetry/latest?deviceIds=${deviceId}` : undefined;
  });

  private readonly firstNumericKey = computed(() => {
    const points = this.latestResource.value() ?? [];
    return points.find((p) => p.value_num !== null)?.key;
  });

  protected readonly seriesResource = httpResource<TelemetryPoint[]>(() => {
    const deviceId = this.selectedDeviceId();
    const key = this.firstNumericKey();
    return deviceId && key ? `/api/v1/telemetry/series?deviceId=${deviceId}&key=${key}` : undefined;
  });

  protected readonly chartOption = computed<EChartsCoreOption | null>(() => {
    const series = this.seriesResource.value();
    if (!series || series.length === 0) return null;
    return {
      xAxis: { type: 'category', data: series.map((p) => new Date(p.ts).toLocaleTimeString()) },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: series.map((p) => p.value_num) }],
    };
  });
}
```

- [ ] **Step 6: Manual smoke test**

With a device selected that has telemetry (Task 18 will have posted some via `curl`), visit `http://demo.localhost:4200/telemetry`, select the demo device, confirm the latest-values table and the line chart both render.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/features/telemetry web/src/app/app.config.ts web/package.json pnpm-lock.yaml
git commit -m "feat(web): minimal telemetry view with latest values table and line chart"
```

---

## Task 18: End-to-end manual verification against the Phase 1.1 acceptance test

design.md §17's Phase 1.1 acceptance test: *"A tenant admin logs in with a password, creates a device, receives an access token, the device `POST`s telemetry over HTTP, and the latest values appear in the UI."* This task walks that path for real, plus spot-checks the two cross-cutting guards (`TenantGuard`, CSRF) that unit tests couldn't fully exercise against a live browser session.

**Files:** none (verification only). If any step fails, fix the responsible task's code and re-run from that step.

- [ ] **Step 1: Bring up a clean stack**

```bash
docker compose -f devops/docker-compose.dev.yml down -v
docker compose -f devops/keycloak/docker-compose.yml up -d
docker compose -f devops/docker-compose.dev.yml up -d
```
Wait ~10s for Postgres/Redis/Keycloak to finish starting.

- [ ] **Step 2: Run the bootstrap sequence**

```bash
pnpm --filter api run migrate:control
pnpm --filter api run keycloak:bootstrap
pnpm --filter api run seed:demo
```
Copy the printed demo device access token — call it `$DEMO_TOKEN` below.

- [ ] **Step 3: Start both dev servers**

Terminal 1: `pnpm --filter api start:dev`
Terminal 2: `pnpm --filter web start` (serves on `http://demo.localhost:4200` per Task 15)

- [ ] **Step 4: Log in as the seeded tenant admin**

Visit `http://demo.localhost:4200`. Expected: redirected to `/login`.
Click "Sign in with Keycloak". Expected: redirected to `http://demo.localhost:8081/realms/thingsvu/...` — if Keycloak rejects `demo.localhost:8081` as a host, use `http://localhost:8081` for this hop only (Keycloak itself isn't tenant-scoped by subdomain in this plan; only `api`/`web` are).
Log in with `admin@demo.test` / `DemoPass123!`. Keycloak will prompt a password change (the credential was created with `temporary: true`) — set any new password you'll remember.
Expected: redirected back to `http://demo.localhost:4200/devices`, topbar shows `admin@demo.test`.

- [ ] **Step 5: Confirm the seeded device and token still work**

Visit `/devices`. Expected: "Demo Sensor" is listed with status `active`.
(Skip issuing a new token — that would invalidate `$DEMO_TOKEN` from Step 2. If you want to test the "Issue token" button, create a *second* device first.)

- [ ] **Step 6: POST telemetry as the device**

```bash
curl -i -X POST http://demo.localhost:3000/api/v1/device/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: $DEMO_TOKEN" \
  -d '{"values":{"temp":23.4,"humidity":48,"online":true}}'
```
Expected: `HTTP/1.1 204 No Content`.

- [ ] **Step 7: Confirm the values appear in the UI**

Visit `/telemetry`, select "Demo Sensor" from the dropdown.
Expected: the latest-values table shows `temp = 23.4`, `humidity = 48`, `online = true`; the line chart renders a single point for `temp` (POST a couple more telemetry payloads a few seconds apart, per Step 6, with different `temp` values, to see the line actually move).

This satisfies the Phase 1.1 acceptance test end to end.

- [ ] **Step 8: Spot-check `TenantGuard` (cross-tenant / no-tenant rejection)**

With the same browser session (still logged in via `demo.localhost`), visit `http://localhost:3000/api/v1/devices` directly (note: plain `localhost`, no `demo.` subdomain, and no cookie will actually be sent here since the session cookie is scoped to `demo.localhost` — that alone would 401; to specifically exercise the *tenant mismatch* branch rather than the *no-session* branch, use curl with the cookie explicitly):

```bash
curl -i http://localhost:3000/api/v1/devices \
  -H "Cookie: sid=<value copied from the demo.localhost browser session's cookie jar>"
```
Expected: `403 Forbidden`, `"This route requires a tenant subdomain"` (plain `localhost` has no subdomain, so `TenantResolutionMiddleware` never populates `TenantContext`, and `TenantGuard` rejects).

- [ ] **Step 9: Spot-check CSRF protection**

```bash
curl -i -X POST http://demo.localhost:3000/api/v1/devices \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=<same session cookie>" \
  -d '{"name":"Should Be Rejected"}'
```
Expected: `403 Forbidden`, `"Invalid or missing CSRF token"` (no `X-CSRF-Token` header sent). Confirm the device was **not** created (`GET /api/v1/devices` from the browser still shows only the devices you created through the UI).

- [ ] **Step 10: Run the full test suite one more time**

```bash
pnpm --filter api test
pnpm --filter api run test:e2e
pnpm --filter web test -- --run
```
Expected: all green.

- [ ] **Step 11: Commit** (only if Step 10 required fixes; otherwise nothing to commit)

```bash
git add -A
git commit -m "fix: address issues found during Phase 1.1 end-to-end verification"
```

---

## Plan self-review

**Spec coverage (design.md §17 Phase 1.1 bullets):**
- Monorepo scaffold + Docker Compose dev stack → Task 1 (Postgres/Redis; Keycloak was already running).
- Control-plane schema + tenant provisioning routine → Tasks 3–4.
- Keycloak realm/clients, password login via web BFF, `/api/v1/auth/me` → Tasks 5–6.
- Angular shell: responsive layout, login redirect, authenticated routing → Task 15.
- Tenant + user management → Tasks 8–9.
- Device profiles + devices CRUD, access-token provisioning → Tasks 10–11.
- HTTP telemetry ingestion → Task 12.
- Minimal telemetry view → Tasks 13, 17.
- Acceptance test → Task 18.

**Placeholder scan:** no `TBD`/`TODO`/"add error handling here" left in any step; the two spots that read like hedges (`@Service` vs `@Injectable` fallback in Tasks 15–17; `provideEchartsCore` name-check in Task 17) each give a concrete, working alternative, not an unresolved gap — they exist because this plan targets library versions (Angular 22, `ngx-echarts`) newer than what could be directly verified against installed `node_modules` during planning.

**Type consistency:** `SessionUser` (Task 6) is used identically by `TenantGuard`/`RolesGuard`/`CurrentUser` (Task 7) and the frontend `SessionUser` model (Task 15) mirrors its shape. `DeviceAuthContext` (Task 12) is distinct from `TenantContextValue` (Task 7) on purpose — documented inline in Task 12 — since device-facing requests never go through subdomain resolution. `SchemaMigration` (Task 3) is the single shape implemented by both `controlMigrations` (Task 3) and `tenantMigrations` (Task 4), and consumed identically by `createSchemaMigrator` and `TenantProvisioningService`.

