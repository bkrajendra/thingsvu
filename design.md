# IoT Cloud Platform — Implementation Specification

**Status:** Ready for implementation
**Audience:** Coding agent + engineering team
**Last updated:** 2026-07-04

This document is the authoritative build spec for a multi-tenant IoT cloud platform (a focused, ThingsBoard-inspired product). It is written so a coding agent can begin implementation phase-by-phase without making architectural guesses. All architectural decisions are final.

---

## 1. Goals & non-goals

### 1.1 In scope (Phase 1)
- Multi-tenant SaaS: `Tenant → User + Device` hierarchy.
- User management with password login and Google social login, via a self-hosted Keycloak IdP.
- Device management: device profiles, devices, tags/groups, attributes.
- Device provisioning: **Access Token** and **MQTT Basic (username/password)**.
- Telemetry ingestion over **HTTP** and **MQTT** (self-hosted EMQX broker).
- Time-series storage in **TimescaleDB**; entity/metadata in **PostgreSQL**.
- **OTA**: platform-side orchestration (upload package, assign to device/group, device pulls over HTTPS, per-device status tracking).
- **Dashboards**: JSON-defined, grid-layout, with an extensible typed widget registry (built-in: time-series line, gauge, value card, table, map).
- Real-time telemetry push to the dashboard via a NestJS WebSocket gateway.
- Modern enterprise dashboard UI in Angular 22 + TailwindCSS, fully responsive / mobile-friendly.

### 1.2 Explicit non-goals (Phase 1)
- No X.509 / mTLS device auth (Phase 2).
- No Customer sub-tenant layer (Phase 2).
- No rule engine / alarms / asset-relation graph (Phase 2).
- No runtime-uploadable third-party widgets — widgets are extended at build time via the registry (Phase 2+).
- No native mobile app build (the PKCE auth path is *designed for* but not *built in* Phase 1).

---

## 2. Locked technology stack

| Layer | Choice | Version / notes |
|---|---|---|
| Backend framework | NestJS | v11 (Express 5, SWC compiler, ESM) |
| Backend ORM | Sequelize via `@nestjs/sequelize` | Entity/metadata only; telemetry uses raw Timescale SQL |
| Entity/metadata DB | PostgreSQL | 16+ |
| Time-series DB | TimescaleDB (Postgres extension) | latest, on the same Postgres 16 instance |
| Cache / sessions | Redis | 7+ |
| MQTT broker | EMQX (self-hosted) | latest; auth/ACL delegated to backend via HTTP hooks |
| Identity provider | Keycloak (self-hosted) | 26.x+; OAuth2/OIDC, PKCE, social, password |
| Frontend framework | Angular | v22 (signals, Signal Forms, OnPush default, TS 6, Node 22+) |
| Styling | TailwindCSS | v4 |
| Component primitives | Spartan UI (Angular CDK + Tailwind) | free, shadcn-style |
| Charts | Apache ECharts (`ngx-echarts` or direct) | for line/gauge widgets |
| Map | Leaflet | for map widget |
| Monorepo | pnpm workspaces | no Nx |
| Containerization | Docker + Docker Compose (dev), Kubernetes (prod) | bare-metal / self-managed k8s |

**Runtime prerequisites:** Node.js 22+, pnpm 9+, TypeScript 6, Docker 24+.

---

## 3. High-level architecture

```
                         ┌─────────────────────────────────────────────┐
                         │                Angular 22 SPA                │
                         │  (Tailwind, signals, dashboards, widgets)    │
                         └───────────────┬──────────────┬──────────────┘
                             HTTPS (cookie│session)      │ WSS (live telemetry)
                                          │              │
                    ┌─────────────────────▼──────────────▼─────────────┐
                    │                  NestJS API                       │
                    │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
                    │  │ Web BFF  │ │  REST    │ │ WebSocket Gateway │   │
                    │  │ (cookie/ │ │ modules  │ │  (live push)      │   │
                    │  │  Redis)  │ │          │ │                   │   │
                    │  └────┬─────┘ └────┬─────┘ └─────────┬─────────┘   │
                    │       │ token relay│                 │             │
                    │  ┌────▼────────────▼─────────────────▼─────────┐   │
                    │  │  Services: tenants, users, devices,         │   │
                    │  │  profiles, telemetry, ota, dashboards,      │   │
                    │  │  provisioning, mqtt-auth-hook               │   │
                    │  └───┬─────────────┬─────────────┬─────────────┘   │
                    └──────┼─────────────┼─────────────┼─────────────────┘
                           │             │             │
              ┌────────────▼──┐  ┌───────▼──────┐  ┌───▼──────────┐
              │  Keycloak     │  │ PostgreSQL   │  │   Redis      │
              │  (OIDC/OAuth2)│  │ + TimescaleDB│  │ sessions,    │
              │  password,    │  │ schema-per-  │  │ token cache, │
              │  Google, PKCE │  │ tenant       │  │ WS fan-out   │
              └───────────────┘  └──────────────┘  └──────────────┘
                                         ▲
                          MQTT auth/ACL  │ HTTP webhook
                        ┌────────────────┴───────────────┐
                        │            EMQX broker          │
                        │  devices connect via MQTT       │
                        └────────────────┬────────────────┘
                                         │ MQTT / HTTPS
                              ┌──────────▼──────────┐
                              │      Devices        │
                              │ (token / mqtt-basic)│
                              └─────────────────────┘
```

**Ingestion data flow (MQTT):** Device connects to EMQX → EMQX calls NestJS auth-hook to authenticate (access token or mqtt-basic) and authorize the topic (ACL) → device publishes to `tenants/{tenantId}/devices/{deviceId}/telemetry` → EMQX forwards to NestJS (rule/bridge or a subscribing ingestion service) → NestJS writes to the tenant's Timescale hypertable → NestJS pushes to subscribed dashboard WebSocket clients via Redis fan-out.

**Ingestion data flow (HTTP):** Device `POST`s to `/api/v1/device/telemetry` with `X-Device-Token` header → NestJS validates token → same write + push path.

---

## 4. Multi-tenancy model (schema-per-tenant)

### 4.1 Database layout
- One PostgreSQL cluster (with TimescaleDB extension enabled).
- **Control-plane schema** `control` (shared): tenant registry, schema mapping, platform admins, global OTA blob metadata index.
- **Per-tenant schema** `tenant_{slug}`: all tenant-scoped tables (devices, device_profiles, telemetry hypertable, dashboards, ota_updates, etc.).

### 4.2 Tenant provisioning routine
Triggered when a platform admin creates a tenant. Must be transactional and idempotent:
1. Insert row into `control.tenants`.
2. `CREATE SCHEMA tenant_{slug}`.
3. Run the per-tenant migration set against that schema.
4. Create the tenant's telemetry **hypertable** and attach retention/compression policies.
5. Create/assign Keycloak artifacts (see §6.1).
6. Mark tenant `status = active`.

Provide a rollback that drops the schema + Keycloak artifacts if any step fails.

### 4.3 Request-time tenant resolution
- Every authenticated request is resolved to a tenant by **subdomain** (`{slug}.platform.example.com`); the resolved tenant is cross-checked against the `tenant_id` claim from Keycloak.
- A NestJS **TenantContext middleware/interceptor** resolves the tenant, looks up `schema_name` from `control.tenants` (cached in Redis), and exposes it to the request-scoped data layer.
- The telemetry/entity repositories run queries with `SET LOCAL search_path TO tenant_{slug}, public` **inside a transaction**, or use a request-scoped Sequelize namespace. Never leak the search_path across pooled connections — always scope it to the transaction/request.
- Reject any request whose resolved tenant does not match the JWT `tenant_id` claim.

### 4.4 Sequelize + schema-per-tenant notes
- Define models schema-agnostically; bind the schema at query time via `Model.schema(schemaName)` or a request-scoped connection.
- Hypertable creation, `time_bucket` aggregations, continuous aggregates, and policies are **not** ORM features — implement them with `sequelize.query()` raw SQL in a dedicated `TelemetryRepository`.
- Maintain two migration sets: `control` migrations (run once) and `tenant` migrations (run per-tenant at provisioning and on upgrades). Build a `migrate:tenants` script that iterates all active tenant schemas.

---

## 5. Data model

### 5.1 Control-plane schema (`control`)

**`tenants`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | used for schema name `tenant_{slug}` |
| name | text | |
| schema_name | text unique | |
| status | text | `provisioning` / `active` / `suspended` |
| keycloak_group_id | text | mapping to Keycloak group (if single-realm model) |
| created_at / updated_at | timestamptz | |

**`platform_admins`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| keycloak_sub | text unique | |
| email | text | |
| created_at | timestamptz | |

**`ota_package_index`** (optional global index; blob content stored on the host-mounted OTA filesystem PV, referenced by path — see §9).

### 5.2 Per-tenant schema (`tenant_{slug}`)

**`user_profiles`** — lightweight mirror of Keycloak identities for display/role mapping (source of truth for identity is Keycloak).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| keycloak_sub | text unique | |
| email | text | |
| display_name | text | |
| role | text | `tenant_admin` / `tenant_user` (Phase 1 RBAC) |
| status | text | `active` / `disabled` |
| created_at / updated_at | timestamptz | |

**`device_profiles`** — reusable device templates.
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| transport | text | `mqtt` / `http` / `default` |
| provision_type | text | `access_token` / `mqtt_basic` |
| telemetry_keys | jsonb | declared keys + types (optional validation) |
| default_attributes | jsonb | |
| created_at / updated_at | timestamptz | |

**`devices`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| device_profile_id | uuid FK | |
| label | text | |
| status | text | `active` / `inactive` |
| last_seen_at | timestamptz | updated on ingest |
| firmware_version | text | current reported version |
| created_at / updated_at | timestamptz | |

**`device_credentials`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| device_id | uuid FK unique | |
| credential_type | text | `access_token` / `mqtt_basic` |
| access_token | text unique nullable | for token method (store hashed + a lookup index) |
| mqtt_username | text nullable | for mqtt_basic |
| mqtt_password_hash | text nullable | bcrypt/argon2 |
| created_at | timestamptz | |

> Store secrets hashed. For access-token lookup at ingest time, keep an indexed hash (e.g. SHA-256) column so validation is O(1) without storing plaintext.

**`device_tags`** and **`device_tag_map`** — flat tags/groups.
| `device_tags` | | |
|---|---|---|
| id | uuid PK | |
| name | text unique | |

| `device_tag_map` | | |
|---|---|---|
| device_id | uuid FK | |
| tag_id | uuid FK | |
| (composite PK) | | |

**`device_attributes`** — key/value attributes (client + server scope).
| column | type | notes |
|---|---|---|
| device_id | uuid FK | |
| scope | text | `client` / `server` / `shared` |
| key | text | |
| value | jsonb | |
| updated_at | timestamptz | |
| (PK: device_id, scope, key) | | |

**`telemetry`** — **TimescaleDB hypertable**.
| column | type | notes |
|---|---|---|
| device_id | uuid | |
| ts | timestamptz | time dimension |
| key | text | telemetry key |
| value_num | double precision nullable | |
| value_str | text nullable | |
| value_bool | boolean nullable | |
| value_json | jsonb nullable | |

- `SELECT create_hypertable('telemetry', 'ts', chunk_time_interval => INTERVAL '1 day');`
- Index: `(device_id, key, ts DESC)`.
- Retention policy: retain **1 year**. Compression policy: compress chunks after 7 days. Both attached per tenant at provisioning.
- A `latest_telemetry` continuous aggregate or a small `telemetry_latest` table (upserted on write) to serve "current value" widgets cheaply.

**`dashboards`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| definition | jsonb | full dashboard JSON (see §10.3) |
| is_default | boolean | |
| created_by | uuid FK user_profiles | |
| created_at / updated_at | timestamptz | |

**`ota_packages`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| title | text | |
| version | text | semver |
| device_profile_id | uuid FK nullable | targetable by profile |
| checksum | text | SHA-256 of the binary |
| signature | text nullable | optional signing |
| size_bytes | bigint | |
| storage_ref | text | path on the host-mounted OTA filesystem PV |
| created_at | timestamptz | |

**`ota_updates`** — per-device rollout status.
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| ota_package_id | uuid FK | |
| device_id | uuid FK | |
| status | text | `queued` / `notified` / `downloading` / `downloaded` / `updated` / `failed` |
| status_detail | text | |
| updated_at | timestamptz | |

**`audit_log`** (basic, Phase 1.3)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| actor_sub | text | |
| action | text | |
| entity_type | text | |
| entity_id | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

---

## 6. Authentication & authorization

### 6.1 Keycloak modeling
- **Single realm** `iot-platform` with tenancy expressed as a **group per tenant** and a `tenant_id` token claim (mapped from group attribute). Roles: `platform_admin`, `tenant_admin`, `tenant_user`.
- **Clients:**
  - `web-bff` — confidential client, Authorization Code + PKCE, used server-side by the NestJS BFF.
  - `mobile-app` — public client, Authorization Code + PKCE (designed now, consumed by the future mobile app).
- **Identity providers:** email/password (Keycloak local) + Google social login configured in the realm.

### 6.2 Web authentication — cookie-based BFF
The NestJS backend acts as the BFF. Browsers never see tokens.

1. Browser hits `/api/v1/auth/login` → NestJS redirects to Keycloak (Auth Code + PKCE, `web-bff` client).
2. Keycloak authenticates (password or Google) → redirects to `/api/v1/auth/callback`.
3. NestJS exchanges the code for tokens, stores `{access_token, refresh_token, id_token, expiry}` **server-side in Redis** keyed by an opaque session id.
4. NestJS sets an **httpOnly, Secure, SameSite=Lax** session cookie holding only the session id.
5. Subsequent SPA calls send the cookie; NestJS looks up the session, **relays** the access token to downstream calls / validates it, and refreshes transparently using the refresh token when near expiry.
6. **Session policy:** sliding inactivity timeout + absolute max lifetime (both configurable). On logout, revoke the Keycloak session and delete the Redis entry.
7. CSRF: since auth is cookie-based, implement CSRF protection (double-submit token or `SameSite=Strict` for state-changing routes + origin checks).

### 6.3 Mobile authentication — OAuth2 + PKCE (designed, not built in Phase 1)
- Public client `mobile-app`, Authorization Code + PKCE, tokens held in the device secure store, silent refresh via refresh token. The REST API accepts Bearer tokens directly for mobile (no BFF cookie layer).

### 6.4 API authorization
- Backend validates JWTs (issuer, audience, signature via Keycloak JWKS) for Bearer requests, and validates the session→token for cookie requests.
- A `TenantGuard` enforces that the resolved schema matches the `tenant_id` claim.
- A `RolesGuard` enforces `platform_admin` / `tenant_admin` / `tenant_user`.

### 6.5 Device authentication (see §7.2 for the EMQX hook)
- **Access Token (HTTP):** `X-Device-Token` header → hashed lookup in `device_credentials`.
- **Access Token (MQTT):** device uses the token as MQTT username (password empty) OR in the client-id per convention → validated by the EMQX auth hook.
- **MQTT Basic:** MQTT username/password → validated (argon2/bcrypt) by the EMQX auth hook.

---

## 7. Device connectivity & ingestion

### 7.1 MQTT topic convention
- Telemetry (device → cloud): `tenants/{tenantId}/devices/{deviceId}/telemetry`
- Attributes update (device → cloud): `tenants/{tenantId}/devices/{deviceId}/attributes`
- Commands / OTA notifications (cloud → device): `tenants/{tenantId}/devices/{deviceId}/commands`
- Payload (telemetry): `{ "ts": 1699999999000, "values": { "temp": 22.5, "humidity": 60 } }` (`ts` optional; server time used if absent).

### 7.2 EMQX authentication & authorization via HTTP hooks
- Configure EMQX `http` authentication + `http` authorization (ACL) pointing at NestJS endpoints:
  - `POST /internal/mqtt/auth` → validates access-token or mqtt-basic credential, returns allow/deny + resolves `{tenantId, deviceId}`.
  - `POST /internal/mqtt/acl` → authorizes publish/subscribe against the device's own topic namespace only.
- These `/internal/*` endpoints are network-restricted to the EMQX pods (NetworkPolicy / mTLS between EMQX and NestJS).

### 7.3 Ingestion from EMQX to NestJS
- **EMQX data bridge / rule → HTTP webhook:** an EMQX rule matches the telemetry topic and POSTs each message to the NestJS ingestion endpoint `/internal/ingest`.
- On receipt: validate against `device_profiles.telemetry_keys` (soft validation), write to Timescale `telemetry`, upsert `telemetry_latest`, update `devices.last_seen_at`, publish to the WS fan-out (§10.4).

### 7.4 HTTP device ingestion
- `POST /api/v1/device/telemetry` with `X-Device-Token` → same write + push path.
- `POST /api/v1/device/attributes` for client-scope attributes.
- `GET /api/v1/device/ota` for OTA pull (§9).

---

## 8. Device provisioning

### 8.1 Access Token method
1. Tenant admin creates a device (optionally from a device profile).
2. Backend generates a random high-entropy token, stores its hash in `device_credentials`, returns the plaintext **once** to the UI.
3. Device uses the token over HTTP (`X-Device-Token`) or MQTT (username).

### 8.2 MQTT Basic method
1. Tenant admin creates the device and sets/receives an MQTT username + generated password.
2. Password hash stored in `device_credentials`; plaintext shown once.
3. Device connects to EMQX with those credentials; EMQX auth hook validates.

### 8.3 Bulk provisioning (Phase 1.3, optional)
- CSV import to create N devices with generated credentials, downloadable credential bundle.

---

## 9. OTA (platform-side orchestration)

**Boundary:** the platform stores packages, assigns them, serves the binary, and tracks status. The **device-side firmware agent is out of scope** — the device is expected to poll/subscribe, download, apply, and report status.

**Flow:**
1. Tenant admin uploads a firmware package (`ota_packages`): binary written to the host-mounted OTA filesystem PV; compute SHA-256, size, optional signature.
2. Admin assigns the package to a device or a tag/group → creates `ota_updates` rows (`status=queued`) per device.
3. Notify devices: publish to `.../commands` (MQTT) or expose via `GET /api/v1/device/ota` (HTTP poll) → returns package metadata + a **short-lived signed download URL**.
4. Device downloads via `GET /api/v1/device/ota/{id}/download` (token-authenticated, supports HTTP range/chunking), verifies checksum, applies, and reports progress via `POST /api/v1/device/ota/{id}/status`.
5. Backend advances `ota_updates.status`; on success updates `devices.firmware_version`.

**UI:** a rollout view showing per-device status counts (queued/downloading/updated/failed) with retry.

---

## 10. Dashboards & extensible widget framework

### 10.1 WidgetDefinition contract (build-time extensibility)
Each widget is a first-class Angular component registered in a **WidgetRegistry**. New widget types are added by implementing the contract and registering it — no runtime code loading in Phase 1.

```ts
export interface WidgetDefinition<TConfig = unknown> {
  type: string;                 // 'timeseries-line' | 'gauge' | 'value-card' | 'table' | 'map'
  displayName: string;
  icon: string;
  component: Type<WidgetComponent<TConfig>>;   // Angular component
  defaultConfig: TConfig;
  configSchema: JsonSchema;     // drives the config editor form (Signal Forms)
  datasource: 'timeseries' | 'latest' | 'attributes' | 'none';
}

export interface WidgetComponent<TConfig> {
  config: InputSignal<TConfig>;
  data: InputSignal<WidgetData>;     // pushed from the datasource layer
}
```

### 10.2 Built-in widgets (Phase 1)
- `timeseries-line` (ECharts) — one or more device/key series over a time window.
- `gauge` (ECharts) — single latest numeric value with thresholds.
- `value-card` — single latest value + label + trend.
- `table` — latest values or recent telemetry rows across devices.
- `map` (Leaflet) — device markers from lat/lon attributes/telemetry.

### 10.3 Dashboard JSON schema
```jsonc
{
  "id": "uuid",
  "name": "Fleet Overview",
  "grid": { "cols": 12, "rowHeight": 40, "gap": 8 },
  "widgets": [
    {
      "id": "w1",
      "type": "timeseries-line",
      "layout": { "x": 0, "y": 0, "w": 6, "h": 6 },
      "datasource": {
        "kind": "timeseries",
        "devices": ["device-uuid"],
        "keys": ["temp", "humidity"],
        "window": { "type": "relative", "value": "24h" },
        "aggregation": { "fn": "avg", "interval": "5m" }   // maps to time_bucket
      },
      "config": { "title": "Temperature", "yAxisLabel": "°C" }
    }
  ]
}
```
- Grid layout: use a Tailwind CSS grid or a lightweight gridstack-style layout; must be responsive (stack columns on mobile).
- Datasource resolution: `timeseries` → Timescale `time_bucket` query; `latest` → `telemetry_latest`; `attributes` → `device_attributes`.

### 10.4 Real-time push (WebSocket gateway)
- NestJS WebSocket gateway (`/ws`), authenticated via the BFF session cookie (or Bearer for mobile).
- Client subscribes to `{device_id, key}` streams a dashboard needs.
- On ingest, the ingestion service publishes to a **Redis pub/sub** channel; each API instance's gateway fans out to its subscribed clients (horizontal-scale safe).
- Message: `{ deviceId, key, ts, value }`.
- Angular consumes via a signal-based `TelemetryStreamService` that feeds widget `data` inputs.

---

## 11. Frontend architecture (Angular 22)

- **Style:** standalone components, signals throughout, OnPush (default in v22), Signal Forms for config/editor forms, Resource API (`httpResource`) for data fetching.
- **Structure (feature-first):**
  ```
  ./web/
    src/app/
      core/            (auth interceptor, tenant context, guards, api clients)
      layout/          (responsive shell: sidebar, topbar, mobile drawer)
      features/
        auth/          (login/callback handling — mostly redirects to BFF)
        devices/       (list, detail, profiles, provisioning, credentials)
        dashboards/    (dashboard list, viewer, editor)
        widgets/       (widget registry + built-in widget components)
        ota/           (packages, rollouts)
        users/         (tenant user management)
        admin/         (platform admin: tenants) — platform_admin only
      shared/          (ui primitives, pipes, directives)
  ```
- **Styling:** TailwindCSS v4, Spartan UI primitives, enterprise dashboard aesthetic (dense tables, cards, subtle borders, dark-mode ready). Fully responsive: sidebar collapses to a drawer on mobile, dashboards reflow to single column.
- **Auth in the SPA:** no tokens in the browser; the app calls `/api/v1/*` with the session cookie. A 401 triggers a redirect to `/api/v1/auth/login`.
- **State:** signals + services; Angular v22 `httpResource` for data fetching.

---

## 12. Backend architecture (NestJS 11)

**Module breakdown:**
```
./api/src/
  main.ts
  app.module.ts
  common/            (guards: TenantGuard, RolesGuard; interceptors; filters)
  config/            (env schema + validation)
  database/          (Sequelize setup, control + tenant connections, migrations)
  tenancy/           (TenantContext middleware, provisioning service)
  auth/              (BFF: login/callback/logout, session service, Redis store, JWKS validation)
  users/             (user_profiles CRUD, Keycloak admin API integration)
  devices/           (devices, profiles, credentials, tags, attributes)
  provisioning/      (access-token & mqtt-basic issuance)
  mqtt-auth/         (/internal/mqtt/auth + /internal/mqtt/acl for EMQX)
  ingestion/         (MQTT subscriber / webhook, telemetry write path)
  telemetry/         (TelemetryRepository — raw Timescale SQL, query API)
  dashboards/        (dashboard CRUD, datasource resolution)
  ota/               (packages, rollouts, device pull endpoints)
  realtime/          (WebSocket gateway + Redis fan-out)
  health/            (liveness/readiness)
```
- **Config:** validate all env at boot (Keycloak URLs/clients, DB, Redis, EMQX hook secret).
- **Migrations:** `control` set + per-`tenant` set; a `migrate:tenants` command iterates active schemas.
- **Observability:** structured JSON logs (NestJS 11 logger), request ids, OpenTelemetry hooks (Phase 1.3).

---

## 13. REST API surface (Phase 1)

**Conventions (OpenAPI 3.1).** The public HTTP API is resource-oriented and versioned. All public endpoints live under the base path `/api/v1`, with the major version carried in the URI (NestJS `VersioningType.URI`) so future breaking changes ship as `/api/v2` without disturbing v1 clients. The contract is generated from decorated controllers/DTOs with `@nestjs/swagger`: interactive docs at `/api/docs`, the machine-readable spec at `/api/openapi.json`. Requests and responses are JSON; resources use plural nouns; standard verbs and status codes apply (`200/201/204`, `400/401/403/404/409/422`). Collection endpoints support pagination (`?limit=&cursor=`), filtering, and sorting. Errors use a consistent problem shape (`{ code, message, details }`). Authorization is enforced by guards/roles, not by URL prefix.

**Auth (BFF)**
- `GET /api/v1/auth/login` → redirect to Keycloak
- `GET /api/v1/auth/callback` → set session cookie
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me` → current user + tenant + roles

**Tenants** (`platform_admin`)
- `GET/POST /api/v1/tenants`, `GET/PATCH /api/v1/tenants/{id}`

**Users** (`tenant_admin`)
- `GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/{id}`

**Device profiles**
- `GET/POST /api/v1/device-profiles`, `GET/PATCH/DELETE /api/v1/device-profiles/{id}`

**Devices**
- `GET/POST /api/v1/devices`, `GET/PATCH/DELETE /api/v1/devices/{id}`
- `POST /api/v1/devices/{id}/credentials` (issue/rotate), `GET /api/v1/devices/{id}/credentials` (metadata only)
- `GET/POST /api/v1/devices/{id}/tags`, `GET/PUT /api/v1/devices/{id}/attributes`

**Telemetry (UI-facing)**
- `GET /api/v1/telemetry/latest?deviceIds=&keys=`
- `GET /api/v1/telemetry/series?deviceId=&keys=&from=&to=&interval=&agg=`

**Dashboards**
- `GET/POST /api/v1/dashboards`, `GET/PUT/DELETE /api/v1/dashboards/{id}`

**OTA**
- `POST /api/v1/ota/packages` (multipart upload), `GET /api/v1/ota/packages`
- `POST /api/v1/ota/packages/{id}/assign` (device or tag), `GET /api/v1/ota/rollouts/{packageId}`

**Device-facing** (device-token auth)
- `POST /api/v1/device/telemetry`, `POST /api/v1/device/attributes`
- `GET /api/v1/device/ota`, `GET /api/v1/device/ota/{id}/download`, `POST /api/v1/device/ota/{id}/status`

**Outside the versioned public surface**
- **Internal (EMQX only):** `POST /internal/mqtt/auth`, `POST /internal/mqtt/acl`, `POST /internal/ingest` — private machine-to-machine endpoints, excluded from the OpenAPI contract.
- **WebSocket:** `WSS /ws` — subscribe to `{deviceId, key}` telemetry streams (separate protocol; versioned via its subscription message schema).

---

## 14. Repository structure (pnpm workspace)

```
iot-platform/
  pnpm-workspace.yaml
  package.json                 (root scripts)

  api/                       (NestJS 11)
  web/                       (Angular 22)
  packages/
    shared-types/              (DTOs, dashboard/widget JSON types shared FE/BE)
    config/                    (shared tsconfig, eslint, prettier)
  deploy/
    docker/                    (Dockerfiles)
    compose/                   (docker-compose.dev.yml)
    k8s/                       (manifests / kustomize overlays)
  docs/
```

---

## 15. Local development environment

Development uses the **same PostgreSQL + TimescaleDB** engine as production (run as a container), so dev and prod share identical schema, hypertable, and query semantics.

**`docker-compose.dev.yml` services:**
- `postgres` — image `timescale/timescaledb:latest-pg16` (Postgres + TimescaleDB in one).
- `redis` — `redis:7`.
- `keycloak` — `quay.io/keycloak/keycloak:latest`, dev mode, realm imported from `deploy/keycloak/realm-export.json`.
- `emqx` — `emqx/emqx:latest`, with HTTP auth/ACL pointed at the API's `/internal/mqtt/*`.

**Bootstrap:**
1. `docker compose -f deploy/compose/docker-compose.dev.yml up -d`
2. Run `control` migrations, then seed one demo tenant (runs the tenant-provisioning routine → creates schema, hypertable, policies, Keycloak group).
3. Seed a `tenant_admin` user and one demo device with an access token.
4. `pnpm --filter api dev` and `pnpm --filter web dev`.

---

## 16. Deployment (Kubernetes on a Cloud VM)

Target environment: a single Cloud VM running Kubernetes, with an ingress controller and cert-manager already installed.

- **Ingress + TLS:** use the cluster's existing ingress controller and cert-manager (issuer already configured). Define `Ingress` resources for the `web` and `api` HTTP routes.
- **Container registry:** Docker Hub. Images are built multi-stage (pnpm), tagged with the Git SHA, and pushed to Docker Hub; `imagePullSecrets` reference Docker Hub credentials.
- **Secrets:** native Kubernetes `Secret` objects (Keycloak client secrets, DB credentials, Redis, EMQX hook secret, Docker Hub pull secret).
- **Storage:** `PersistentVolumeClaims` backed by **host-mounted PVs** for Postgres/TimescaleDB, Redis, EMQX, Keycloak, and the **OTA blob volume** (firmware binaries live on this host-mounted PV, referenced by `ota_packages.storage_ref`).
- **MQTT / port exposure:** the EMQX MQTT listeners (1883/8883) and any other non-HTTP port exposure are managed by the operator outside this spec.
- **Networking:** `NetworkPolicies` restrict `/internal/*` to EMQX pods.

**Workloads:** `api` (Deployment), `web` (static assets served via nginx/ingress), `postgres/timescale` (StatefulSet), `redis`, `keycloak`, `emqx` (StatefulSet).

**Config progression:** Docker images (multi-stage, pnpm, Git-SHA tags) → docker-compose (local dev) → Kubernetes manifests/kustomize (prod).

---

## 17. Phased delivery plan

### Phase 1.1 — Foundational, testable slice
**Goal:** log in with a password and get a device sending data with a token.
- Monorepo scaffold (pnpm), Docker Compose dev stack.
- Control-plane schema + tenant provisioning routine (schema + hypertable + policies).
- Keycloak realm/clients; **password login** via the web BFF (cookie/Redis sessions); `/api/v1/auth/me`.
- Angular shell: responsive layout, login redirect, authenticated routing.
- Tenant + user management (create tenant [admin], create tenant users).
- Device profiles + devices CRUD; **access-token** provisioning.
- **HTTP telemetry ingestion** (`X-Device-Token`) → Timescale write + `telemetry_latest`.
- Minimal telemetry view: latest-values table + a single line chart (no full dashboard engine yet).

**Acceptance:** A tenant admin logs in with a password, creates a device, receives an access token, the device `POST`s telemetry over HTTP, and the latest values appear in the UI.

### Phase 1.2 — MQTT, real-time, dashboards
- EMQX integration; `/internal/mqtt/auth` + `/internal/mqtt/acl`; **access-token over MQTT** and **MQTT Basic** provisioning.
- Ingestion subscriber (EMQX → NestJS) for MQTT telemetry.
- WebSocket gateway + Redis fan-out; live push.
- Dashboard engine: JSON dashboards, grid layout, WidgetRegistry, and the five built-in widgets (line, gauge, value-card, table, map).
- Dashboard CRUD + editor (Signal Forms config).

**Acceptance:** A device publishes telemetry over MQTT (token and mqtt-basic both work); a dashboard shows a live-updating chart and gauge.

### Phase 1.3 — OTA, tags, polish
- OTA: package upload/storage, assignment to device/group, device pull endpoints, per-device status tracking, rollout UI.
- Tags/groups + device attributes UI.
- RBAC hardening (`platform_admin` / `tenant_admin` / `tenant_user`), basic audit log.
- Bulk device provisioning (optional), CSV import.
- Observability: structured logs, health checks, basic metrics.

**Acceptance:** An admin uploads firmware, assigns it to a device group, and tracks each device through queued → updated/failed.

### Phase 2+ — Enterprise roadmap (suggested, prioritized)
1. **X.509 / mTLS device provisioning** + per-tenant CA lifecycle.
2. **Rule engine + alarms** (thresholds, event routing, notifications — email/webhook/Slack).
3. **Customer sub-tenant layer** (`Tenant → Customer → User/Device`) with scoped RBAC.
4. **Asset/relation graph** (assets, device-to-asset relations; consider a graph store if traversal-heavy).
5. **Advanced RBAC** (custom roles, per-entity permissions), **SSO/SAML** for enterprise customers.
6. **Runtime-extensible widgets** (Module Federation or sandboxed widgets) + a widget marketplace.
7. **Data lifecycle**: continuous aggregates/downsampling, tiered retention, export.
8. **Edge/gateway support**, **device shadow/twin**, **CoAP/LwM2M** transports.
9. **Notifications center**, **audit/compliance reporting**, **API keys & rate limiting**.
10. **Native mobile app** (Angular/Ionic or native) consuming the PKCE flow.
11. **Multi-region / HA**, white-labeling, usage metering & billing.

---

## 18. Security checklist (Phase 1)
- All secrets hashed at rest (device credentials, MQTT passwords).
- JWT validation via Keycloak JWKS (issuer/audience/exp).
- BFF: httpOnly + Secure + SameSite cookies; CSRF protection on state-changing routes.
- `TenantGuard` prevents cross-tenant access; verify `search_path` scoping never leaks across pooled connections.
- `/internal/*` reachable only from EMQX (NetworkPolicy + shared secret / mTLS).
- OTA download URLs short-lived and signed; verify checksum/signature.
- Rate-limit device-facing and auth endpoints.
- TLS everywhere (ingress, MQTT over 8883, DB connections).
