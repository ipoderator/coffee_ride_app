# Deployment

How to run Coffee Ride in production using the artifacts already in this repo:
`apps/web/Dockerfile`, `apps/api/Dockerfile`, `packages/db/Dockerfile`,
`docker-compose.prod.yml`, `deploy/Caddyfile` (CR-074/075/076, ADR-018). This is the
procedure, written once these pieces existed — it has not been exercised by an actual
`docker compose up` in any session so far (Docker's daemon is unreachable in this
sandbox, KI-019; see `.claude/context/known-issues.md` KI-043/KI-045). Treat it as
reviewed, not live-verified, until a real run confirms it.

## Prerequisites

- A host with Docker Engine + Compose v2 (`docker compose`, not the standalone
  `docker-compose` v1 binary).
- A DNS `A`/`AAAA` record for the domain you'll deploy under, already pointing at that
  host — Caddy's automatic TLS (ADR-018) needs this to complete its ACME challenge on
  first boot.
- A reachable PostgreSQL instance, a reachable Redis instance, and a reachable
  S3-compatible object store (real S3, or a self-hosted MinIO). `docker-compose.prod.yml`
  deliberately does not start any of these itself — where they run is an operator
  decision ADR-018 explicitly leaves open (see its "What this does NOT mean" section).
  Redis and S3 are optional at the application level (`apps/api/src/env.ts`,
  `GET /health`'s `not_configured` state) but every feature that depends on them
  (async notification delivery, GPX/route file storage) stays degraded without one.

## 1. Configure `.env`

Copy `.env.example` to `.env` next to `docker-compose.prod.yml` and fill in every value
for real — `.env.example`'s own comments document what each one is for and which
service consumes it. In particular:

- `AUTH_SECRET` — generate with `openssl rand -base64 32`. `apps/api` refuses to boot in
  production with the placeholder `change-me` value (CR-073, `env.ts`'s
  `PRODUCTION_PLACEHOLDER_CHECKS`).
- `DOMAIN` / `ACME_EMAIL` — the real hostname from the DNS record above, and a real
  address for Let's Encrypt's expiry notices. `api`'s `WEB_ORIGIN` (the CSRF
  Origin/Referer check, ADR-013) is derived from `DOMAIN` inside
  `docker-compose.prod.yml` itself — don't set `WEB_ORIGIN` independently in `.env`, it's
  ignored for the `api` service in this file.
- `DATABASE_URL` / `REDIS_URL` / `S3_*` — point at the real instances from the
  Prerequisites step. Leaving `REDIS_URL`/`S3_ENDPOINT` empty is a supported degraded
  boot (KI-046, resolved) — `apps/api` starts fine and `GET /health` reports
  `not_configured` for that dependency rather than `error`.
- `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` / `MAPS_2GIS_API_KEY` — separate 2GIS keys
  per `.claude/rules/maps.md`; the first is baked into the `web` image at build time
  (`docker-compose.prod.yml`'s `build.args`), the second is read at runtime by `api`
  only. Also fine to leave unset — every map surface has a documented degraded state
  (KI-031).
- `ERROR_REPORTING_WEBHOOK_URL` — optional, and unset is the accepted launch
  configuration (ADR-030): no error-tracking vendor is adopted. Errors stay fully
  visible via structured stdout logs, just not forwarded anywhere — which makes the
  host responsible for retaining or shipping those logs, since with no sink configured
  stdout is the only record of an error and it is lost with the container.

`apps/api` validates this whole set at boot (`env.ts`) and refuses to start rather than
run with a missing/placeholder production value — a misconfigured `.env` fails loudly
and immediately, not as a runtime surprise later.

Check the file before deploying, without booting anything:

```sh
pnpm preflight --env /path/to/your/production.env
```

`apps/api/scripts/preflight.ts` (CR-210) reports two tiers. An **ERROR** is a
configuration `loadEnv()` would refuse to boot — fix it first; it exits 1. A
**WARNING** is configuration that boots, in a deliberately supported degraded mode,
but that leaves a user-facing feature non-functional in production — most importantly
`UNISENDER_API_KEY` set with `EMAIL_FROM_ADDRESS` empty, which silently makes email
verification and password reset dead ends for every real user (KI-026, KI-042).
Warnings exit 0 on purpose: they are the operator's call, and a check that fails on an
accepted degraded mode teaches people to ignore it. The same warnings are logged at
`api` boot. On a first deploy, work through `deploy/FIRST-DEPLOY.md` alongside this
document.

## 2. First boot: migrate before serving traffic

Run the one-shot migration job before starting `api`/`web` for the first time:

```sh
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
```

This is gated behind the `migrate` Compose profile on purpose (CR-076) — it never runs
as part of a plain `docker compose up`, and `packages/db/src/migrate.ts` wraps the
actual migration in a session-level Postgres advisory lock so running it concurrently
(e.g. from two release pipelines racing) is safe rather than corrupting.

## 3. Start the application

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

This builds and starts `caddy`, `web`, and `api` (the `migrate` service stays out of a
plain `up` — see step 2). `caddy` is the only container publishing host ports (`80`/
`443`); `api` publishes none at all and is reachable only from `web` over the internal
Compose network (ADR-018 §2) — `apps/web/next.config.ts`'s own `/api/v1/*` rewrite is
the one place that routing happens. Its target (`API_INTERNAL_URL=http://api:4000`) is a
`web` **build arg**, not a runtime env var (CR-134): Next resolves rewrites at `next
build`, so changing it means rebuilding the `web` image (`--build`), never just editing
the container environment.

Before a release, `pnpm smoke:docker` (`deploy/smoke/run.sh`, also CI's `docker-smoke`
job) builds these same images from this same file, runs them with a throwaway Postgres
(Caddy/backup disabled), and requires `GET /api/v1/rides` through `web` to return `200`
and `api` to publish no host port.

## 4. Verify

- `curl -s https://<DOMAIN>/api/v1/../health` won't resolve through the proxy (Caddy
  doesn't route `/api/*` — see ADR-018 §2); instead check from inside the Compose
  network: `docker compose -f docker-compose.prod.yml exec web wget -qO- http://api:4000/health`.
  `GET /health` always returns `200`; read the JSON body's per-dependency
  `ok`/`error`/`not_configured` fields (CR-051) rather than the HTTP status to tell a
  genuinely broken dependency from one that's just not configured.
- Confirm `https://<DOMAIN>/` loads over a real certificate — Caddy's ACME issuance
  happens automatically on first request to a hostname it doesn't have a cert for yet;
  check `docker compose -f docker-compose.prod.yml logs caddy` if it doesn't.
- `docker compose -f docker-compose.prod.yml logs -f api` / `... logs -f web` — both
  emit structured (pino, JSON) logs to stdout. Every request/response pair and every
  reported error carries a `reqId` (CR-079, `apps/api/src/lib/request-id.ts`) that also
  appears as the `X-Request-Id` response header, so a single request can be traced
  through the logs even across the Caddy → web → api hop.

## Redeploying / updating

```sh
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate   # only if the release adds migrations
docker compose -f docker-compose.prod.yml up -d --build
```

Always run the `migrate` step before `up -d --build` if the release includes new
migrations — never rely on application boot to apply them (CR-076's whole point: several
`api` instances/replicas starting at once must never race a schema migration).

## Rollback

There is no automated down-migration step — Drizzle's generated migrations in
`packages/db` are forward-only, and none of this repo's tooling generates or runs a
reverse migration. Rolling back application code to a previous image is safe on its own
(redeploy the previous tag); rolling back past a migration that changed the schema in a
way the previous code doesn't expect needs a manually written reverse migration first —
treat that as its own reviewed change, not a scripted rollback command.

## Backups

See `docs/database.md` → "Backups" for `packages/db/scripts/backup.sh`/`restore.sh` —
not duplicated here. They're driven entirely by `DATABASE_URL`, same as this file's
migration step, with no assumption about where Postgres runs.

## Known limitations

A first deploy works through `deploy/FIRST-DEPLOY.md`, which separates what CI's
`docker-smoke` job already proves from what has never been executed anywhere (Caddy at
runtime, ACME/TLS, the `backup` service) and gives each a pass criterion.

- None of this procedure has been exercised by an actual `docker build`/`docker compose
up`/`docker compose run` in any session — Docker's daemon has been unreachable
  throughout (KI-019, KI-043, KI-045). It's been reviewed against the compose/Dockerfile
  definitions and, where possible, validated with the equivalent commands run directly
  on the host (e.g. the migration script's own concurrency safety, CR-076).
- Caddy's automatic TLS additionally needs a real public DNS record — unverifiable in
  any sandbox regardless of Docker access.
- Client IPs through the Caddy → web → api hop (KI-044, resolved CR-145): Caddy
  overwrites X-Forwarded-For with the client address, Next's rewrite forwards it
  unchanged, and `api` trusts exactly one private hop (`TRUST_PROXY_HOPS: 1` in
  `docker-compose.prod.yml`, `apps/api/src/lib/trust-proxy.ts`) — so the per-IP rate
  limiters key on real clients. `deploy/smoke/run.sh` checks this through the prod
  images. Keep `api` without `ports:`; see `apps/api/src/env.ts` before changing
  either.
