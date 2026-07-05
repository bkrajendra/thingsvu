# ThingsVU

A multi-tenant IoT cloud platform (a focused, ThingsBoard-inspired product): register devices, stream their telemetry in real time, and manage users per tenant — with a self-hosted Keycloak IdP backing authentication.

This README covers **Phase 1.1**, the foundational slice: password login through Keycloak, tenant + user management, device provisioning with access tokens, HTTP telemetry ingestion, and a minimal telemetry dashboard. See [`design.md`](./design.md) for the full multi-phase architectural spec, and [`docs/superpowers/plans/2026-07-04-phase-1-1-foundational-slice.md`](./docs/superpowers/plans/2026-07-04-phase-1-1-foundational-slice.md) for the implementation plan this was built from (including a log of deviations from the original spec and bugs found during real end-to-end verification).

## Architecture at a glance

```
Angular 22 SPA (web/)  ──HTTPS(cookie)──▶  NestJS 11 BFF (api/)  ──▶  PostgreSQL + TimescaleDB
                                                  │                    (control schema + one
                                                  │                     schema per tenant)
                                                  ├──▶  Redis (sessions, tenant cache)
                                                  └──▶  Keycloak (OIDC/PKCE, password login)

IoT devices  ──HTTP + X-Device-Token──▶  NestJS ingestion endpoint  ──▶  TimescaleDB hypertable
```

- **Multi-tenancy:** one Postgres schema per tenant (`tenant_{slug}`), resolved per-request by subdomain (`{slug}.yourdomain.com`, or `demo.localhost` in dev).
- **Auth:** the API is a cookie-session **BFF** — the browser never sees an access token. Keycloak issues tokens only to the backend, which stores them server-side (Redis-backed sessions) and hands the browser an httpOnly cookie.
- **Devices:** authenticate to the ingestion endpoint with a per-device access token (`X-Device-Token` header), resolved to a tenant via a control-plane index table — devices never need to know their tenant's subdomain.

## Prerequisites

- Node.js 22+, [pnpm](https://pnpm.io) 9+ (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose
- ~2 GB free for the Postgres/Redis/Keycloak containers

## Local development setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure

```bash
docker compose -f devops/docker-compose.dev.yml up -d      # Postgres+TimescaleDB, Redis
docker compose -f devops/keycloak/docker-compose.yml up -d  # Keycloak
```

Wait ~10–15s for Keycloak to finish starting (`docker logs keycloak -f` until you see "Keycloak ... started").

### 3. Configure environment

```bash
cp api/.env.example api/.env
```

Then edit `api/.env`:
- `KEYCLOAK_CLIENT_SECRET` — the confidential client secret for the `thingsvu` client in the `thingsvu` realm. If you're starting from a fresh Keycloak (no realm yet), see [Realm setup](#realm-setup-first-time-only) below to create it, then paste the secret here.
- Everything else in `.env.example` has sane dev defaults — **but read the comment above `APP_BASE_URL`/`WEB_BASE_URL` carefully.** They must point at a tenant subdomain (`http://demo.localhost:3000` / `http://demo.localhost:4200`), not plain `localhost`. This isn't optional: the login→callback round trip depends on the browser presenting the same host throughout, and subdomain-based tenant resolution requires it everywhere else too. Using plain `localhost` here causes a very confusing "OAuth state mismatch" error on login.

### 4. Realm setup (first time only)

If your Keycloak instance doesn't already have a `thingsvu` realm with a `thingsvu` confidential client:

1. Open `http://localhost:8081`, log in with `admin` / `adminpassword` (from `devops/keycloak/docker-compose.yml`).
2. Create realm `thingsvu`.
3. Create a confidential client `thingsvu` with:
   - **Valid redirect URIs:** `http://demo.localhost:3000/api/v1/auth/callback` (and `http://localhost:3000/api/v1/auth/callback` if you ever test without the subdomain)
   - **Web origins:** `http://demo.localhost:4200`
   - Standard flow (Authorization Code) enabled.
4. Copy the client's **Credentials → Client secret** into `api/.env`'s `KEYCLOAK_CLIENT_SECRET`.
5. Run the bootstrap script (below) — it idempotently creates the realm roles and the two protocol-mapper/user-profile fixes that make the `tenant_id`/roles claims actually work (see [Keycloak gotchas](#keycloak-gotchas-read-this-before-debugging-a-403) if you're curious why these are needed).

### 5. Bootstrap the database and realm

Run these once, in order:

```bash
pnpm --filter api run migrate:control     # creates the control schema
pnpm --filter api run keycloak:bootstrap  # realm roles + tenant_id claim wiring (idempotent)
pnpm --filter api run seed:demo           # demo tenant + tenant_admin + device + access token
```

`seed:demo` prints a demo device access token — **copy it**, you'll need it to test telemetry ingestion (Step 7 below), and it's only ever shown once. It also creates `admin@demo.test` with a temporary password (`DemoPass123!`) — Keycloak will prompt you to set a new one on first login.

### 6. Add a hosts entry (Windows only, if needed)

Modern browsers resolve `*.localhost` to `127.0.0.1` automatically (RFC 6761), so `http://demo.localhost:4200` usually just works. If it doesn't on your machine, add this line to `C:\Windows\System32\drivers\etc\hosts` (as Administrator):

```
127.0.0.1 demo.localhost
```

Note that some tools (Node's own DNS resolution, `curl` without `--resolve`) do **not** implement the browser's special-case for `*.localhost` — see [Windows *.localhost resolution](#windows-localhost-resolution) below if a backend script needs to reach `demo.localhost` directly.

### 7. Run the dev servers

```bash
pnpm --filter api start:dev    # http://localhost:3000  (API + Swagger at /api/docs)
pnpm --filter web start        # http://localhost:4200
```

Visit **`http://demo.localhost:4200`** (not plain `localhost:4200`) — you should be redirected to a login page. Sign in with `admin@demo.test` and the password from Step 5.

### 8. Try the full flow

1. On `/devices`, confirm "Demo Sensor" is listed.
2. Post telemetry as the device, using the token from Step 5:
   ```bash
   curl -X POST http://demo.localhost:3000/api/v1/device/telemetry \
     -H "Content-Type: application/json" \
     -H "X-Device-Token: <your demo device token>" \
     -d '{"values":{"temp":23.4,"humidity":48}}'
   ```
   Expect `204 No Content`.
3. Visit `/telemetry`, select "Demo Sensor" — the latest values and a line chart should render.

## Environment variables

All backend config lives in `api/.env` (see `api/.env.example` for the full annotated list, validated at boot via Joi — the app refuses to start if anything required is missing). Frontend config is minimal: `web/proxy.conf.json` routes `/api` to the backend during `ng serve`; there's no separate frontend `.env`.

| Variable | Purpose |
|---|---|
| `APP_BASE_URL` / `WEB_BASE_URL` | Must be the tenant-subdomain URLs in dev (`demo.localhost`); in prod, your real per-tenant or platform hostnames |
| `DB_*` | Postgres connection (control schema + all tenant schemas live in one database) |
| `REDIS_*` | Session store + tenant-resolution cache |
| `SESSION_SECRET` | Signs the session cookie — **generate a real random value for anything beyond local dev** |
| `KEYCLOAK_*` | Realm/client/admin credentials — `KEYCLOAK_ADMIN_*` are used only by one-off scripts (`keycloak:bootstrap`, `seed:demo`), never by the running app |
| `DEVICE_TOKEN_HASH_SECRET` | HMAC pepper for hashing device access tokens before storage — **rotate-worthy secret, never commit** |

## Testing

```bash
pnpm --filter api test        # backend unit tests (needs Postgres/Redis/Keycloak running)
pnpm --filter api run test:e2e
pnpm --filter web test        # frontend unit tests
```

Most backend tests hit the real Postgres/Keycloak instances rather than mocking them (the whole point of a lot of this code — SQL correctness, Keycloak's admin REST wire format — can't be verified against a mock). Make sure the containers from Step 2 are running.

## Known dev-environment quirks

### Windows `*.localhost` resolution

On at least some Windows setups, browsers resolve `*.localhost` to `127.0.0.1` automatically, but the OS resolver (and therefore Node's `dns`, and `curl` without help) does not. Symptoms: `ng serve`/backend scripts fail with `getaddrinfo ENOTFOUND` when literally binding to `demo.localhost`, or a plain `curl http://demo.localhost:3000/...` hangs/fails. Workarounds already applied where it matters:
- The Angular dev server binds to plain `localhost`/`0.0.0.0` (not `--host demo.localhost`) and instead allows the `demo.localhost` Host header via `angular.json`'s `allowedHosts`.
- For `curl` from a script or CI, use `curl --resolve demo.localhost:3000:127.0.0.1 http://demo.localhost:3000/...` instead of relying on DNS.

### Keycloak gotchas (read this before debugging a 403)

Two non-obvious Keycloak behaviors caused real, hard-to-diagnose bugs during development — both are now handled by `keycloak:bootstrap`, but are worth knowing if you ever see a logged-in user with an empty `tenantId` or `roles` in `GET /api/v1/auth/me`:

1. **Keycloak's "User Profile" feature silently drops unknown user attributes.** By default only `username`/`email`/`firstName`/`lastName` are persisted; setting any other attribute via the Admin API (like this app's `tenant_id`) via `PUT /admin/realms/{realm}/users/{id}` returns `204 No Content` as if it succeeded, but the value is silently discarded unless that attribute is explicitly declared in the realm's User Profile schema first. `keycloak:bootstrap` declares it (admin-only view/edit).
2. **The built-in "roles" client scope only maps `realm_access.roles` into the access token, not the ID token.** This app's BFF only ever decodes the ID token. `keycloak:bootstrap` flips `id.token.claim` on for that mapper.

If you ever manually edit a user's attributes in the Keycloak admin console (e.g. while debugging), remember that a full profile save can silently clear attributes that aren't part of the visible form fields — re-run `keycloak:bootstrap` and re-check `GET /api/v1/auth/me` after any manual Keycloak edits.

### Test data cleanup

Backend tests that provision real tenant schemas clean up after themselves (`afterEach`/`afterAll` drop their own schema and rows), but if a test run is interrupted (Ctrl+C, crash) it can leave orphaned rows in `control.tenants` or orphaned `tenant_*` schemas that cause a *different* test's fixture setup to fail with a unique-constraint violation on next run. If you see a test fail with a duplicate-key error on a schema/slug you don't recognize, check:
```sql
SELECT slug, schema_name FROM control.tenants;
```
and manually `DROP SCHEMA ... CASCADE` / `DELETE FROM control.tenants WHERE slug = '...'` for anything left over from an interrupted run.

## Production deployment

Phase 1.1 targets a single Kubernetes cluster (per `design.md` §16); the progression is **Docker images → Docker Compose (dev, this README) → Kubernetes manifests (prod)**. This repo doesn't yet include the Kubernetes manifests/Dockerfiles — this section is what to build when you get there.

### Container images

Build multi-stage images for `api/` and `web/`, tagged with the Git SHA:

```dockerfile
# api/Dockerfile (sketch)
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter api build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/node_modules ./node_modules
COPY --from=build /app/api/package.json .
CMD ["node", "dist/main"]
```

`web/` builds to static assets (`ng build`) served via nginx or your ingress controller directly — it has no server-side runtime.

Push to Docker Hub (or your registry of choice); reference via `imagePullSecrets` in your Deployment manifests.

### Required production changes — do not deploy Phase 1.1 config as-is

- **`SESSION_SECRET`, `DEVICE_TOKEN_HASH_SECRET`, `KEYCLOAK_CLIENT_SECRET`, DB/Redis passwords:** all currently dev placeholder values in `.env.example`. Generate real random secrets and inject via Kubernetes `Secret` objects, never baked into the image.
- **Cookies:** `NODE_ENV=production` flips session and CSRF cookies to `secure: true` (already wired in `main.ts`/`auth.controller.ts`) — this requires the app to actually be served over HTTPS, so make sure TLS terminates at the ingress before this matters.
- **CORS:** `main.ts` currently allows a single `WEB_BASE_URL` origin. If you serve multiple tenant subdomains from the same web app in production, revisit this — the current single-origin CORS config assumes one frontend origin.
- **Redis/Postgres:** dev compose runs single-instance, no auth beyond a password, no backups. Use managed or properly-configured HA instances in production, with real `PersistentVolumeClaims` (design.md suggests host-mounted PVs for a single-VM deployment; use your platform's durable storage for anything real).
- **`/internal/*` endpoints** (planned for Phase 1.2's MQTT auth hooks) must be network-restricted to trusted callers only — not relevant yet in Phase 1.1 (no `/internal/*` routes exist), but keep in mind for Phase 1.2.
- **Keycloak realm:** the dev realm's redirect URIs/web origins point at `demo.localhost`. Production needs the real per-tenant or platform hostnames registered on the client, and `KEYCLOAK_ISSUER`/`APP_BASE_URL`/`WEB_BASE_URL` updated to match.
- **Database migrations:** `migrate:control` and `migrate:tenants` are plain scripts today, meant to be run manually or from a CI/CD step before rolling out a new version — there's no automatic migration-on-boot. Wire these into your deployment pipeline explicitly.

### Networking

MQTT broker (EMQX) and non-HTTP port exposure are out of scope for Phase 1.1 (see `design.md` §17, Phase 1.2) — this deployment only needs standard HTTP(S) ingress for `api`/`web`.

## Repository layout

```
api/            NestJS 11 backend (BFF, tenant provisioning, device/telemetry APIs)
web/            Angular 22 frontend
devops/
  docker-compose.dev.yml   Postgres+TimescaleDB, Redis
  keycloak/                Keycloak dev container
docs/
  superpowers/plans/       Implementation plan(s) — includes a full log of design deviations and bugs found
design.md       Full multi-phase architectural specification
```

## What's not in Phase 1.1

Rule engine/alarms, MQTT ingestion, OTA updates, dashboards (beyond the minimal telemetry view), customer sub-tenants, and X.509 device auth are all explicitly out of scope for this slice — see `design.md` §1.2 and §17 for the phased roadmap.
