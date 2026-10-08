# Deployment

How to run Coffee Ride in production. The supported setup (ADR-031, CR-218) is **one
host** running everything with Docker Compose:

- `docker-compose.prod.yml` — Caddy (TLS, the only public entry point), `web`, `api`,
  the one-shot `migrate` job and the `backup` loop (CR-074/075/076, ADR-018);
- `docker-compose.infra.yml` — Postgres 17, Redis 8 and SeaweedFS (S3) on the same
  host, no published ports, passwords from `.env`;
- `deploy/deploy.sh` — the whole sequence: build → data services → bucket →
  migrations → application;
- `deploy/production.env.example` — every setting, with how to generate it.

CI's `docker-smoke` job (`deploy/smoke/run.sh`) runs this exact pair of files on every
push: builds the images, brings up Postgres/Redis/S3, applies migrations, requires
`GET /api/v1/rides` through `web` to answer, `GET /health` to report every dependency
`ok`, and a `backup` dump to restore into a fresh database. What no CI run can cover —
Caddy's certificate, the real domain, real email — is in `deploy/FIRST-DEPLOY.md`.

## Prerequisites

- A Linux host with at least **2 vCPU, 4 GB RAM, 40 GB disk** (the containers' memory
  limits add up to ~3 GB), Docker Engine and Compose v2 (`docker compose`).
- Ports 80 and 443 open to the internet; everything else closed (e.g. `ufw allow
OpenSSH && ufw allow 80,443/tcp && ufw enable`). No data service publishes a port.
- A DNS `A`/`AAAA` record for the domain, already pointing at the host — Caddy needs it
  to pass its ACME challenge on first start. Verify from elsewhere: `dig +short <DOMAIN>`.
- For real users: a Unisender Go account with a verified sender address (without it,
  email verification and password reset never arrive — and publishing a ride needs a
  verified email), and 2GIS keys if maps should work (a demo key refuses routes over
  50 km, KI-075).

## 1. Configure `.env`

On the host, in the repository checkout:

```sh
cp deploy/production.env.example .env
openssl rand -hex 32   # once per secret: AUTH_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD, S3_*
```

Fill in every value; the file's comments say what each one is for. In particular:

- `DOMAIN` / `ACME_EMAIL` — `api`'s `WEB_ORIGIN` (the CSRF Origin/Referer check,
  ADR-013) is derived from `DOMAIN` inside `docker-compose.prod.yml`; never set it
  separately.
- Passwords are hex on purpose: the overlay puts them into connection URLs unescaped.
  `DATABASE_URL`/`REDIS_URL`/`S3_ENDPOINT` stay empty — the overlay derives them.
- `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is baked into the `web` image at build time
  (`build.args`); changing it means rebuilding, which `deploy.sh` always does.
- `ERROR_REPORTING_WEBHOOK_URL` — optional; unset is the accepted launch configuration
  (ADR-030). Errors are then only in container logs, which rotate at 5 × 10 MB per
  container.

`apps/api` validates the configuration at boot (`env.ts`) and refuses to start with a
missing or placeholder production value. Configuration that boots but leaves a feature
dead (CR-210's warning tier — above all email without a verified sender) is logged at
boot with `"preflight":true`; `deploy.sh` prints those lines at the end. To check a
configuration before deploying, from a development checkout:
`pnpm preflight --env /path/to/production.env` (fill in the three URL lines first, as
the overlay would derive them — preflight reads the file, not the overlay).

## 2. Deploy

```sh
deploy/deploy.sh
```

It refuses to start if a required value is empty, then:

1. builds the `web`, `api` and `migrate` images — a failed build changes nothing that is
   running;
2. starts Postgres, Redis and S3 and waits until each reports healthy;
3. creates the storage bucket (`s3-init`; a no-op when it exists);
4. applies migrations (`migrate`, behind the `migrate` profile — never part of a plain
   `up`, CR-076; `packages/db/src/migrate.ts` holds an advisory lock, so a concurrent
   run is safe);
5. starts everything else (`caddy`, `web`, `api`, `backup`) and shows `docker compose ps`.

`caddy` is the only container with host ports. `api` is reachable only from `web` over
the Compose network (ADR-018 §2): `apps/web/next.config.ts`'s `/api/v1/*` rewrite is
the one place that routing happens, and its target is a `web` build arg (CR-134).

For the rest of this document, `dc` means
`docker compose -f docker-compose.prod.yml -f docker-compose.infra.yml`.

## 3. Verify

On a first deploy, work through `deploy/FIRST-DEPLOY.md`. Every deploy:

- `dc exec web wget -qO- http://api:4000/health` — read the JSON body, not the status
  (always `200`): `db`, `redis` and `s3` must each say `ok`.
- `https://<DOMAIN>/` loads over a valid certificate; if not, `dc logs caddy`.
- `dc logs -f api` / `dc logs -f web` — structured JSON; each request carries a `reqId`
  that is also the `X-Request-Id` response header (CR-079).

## Updating

```sh
git pull
deploy/deploy.sh
```

The same script: it rebuilds, applies any new migrations before the new `api` starts,
and recreates only containers whose image or configuration changed. Never rely on
application boot to apply migrations.

## Production host (CR-219)

`coffeeride.site` (and `www.` → 301) runs on the VPS `72.56.110.108` from
`/opt/deployments/coffee-ride` (the host's convention: one directory per project
under `/opt/deployments/`). The checkout and `.env` (mode 600) are root-owned.
SSH as `gleb` (passwordless sudo); root login is disabled, and fail2ban bans an
address after a single failed key attempt — fix the key before retrying. Update
there with `sudo git pull && sudo deploy/deploy.sh`. The same host runs other
stacks (beszel, a Hermes audit stack); keep the `coffee-ride` compose project name.

While this host is a test deploy with no verified email sender, its `.env` sets
`AUTH_SKIP_EMAIL_VERIFICATION=true` (CR-220): new accounts are created already
verified, so publishing a ride needs no email. The API logs a preflight warning
while it is on; unset it (and configure `EMAIL_FROM_ADDRESS`) before real users.

## Rollback

Drizzle migrations are forward-only. Rolling back application code alone is safe —
check out the previous commit and run `deploy/deploy.sh`. Rolling back past a migration
the previous code doesn't understand needs a hand-written reverse migration first,
reviewed as its own change.

## Backups

The `backup` service dumps the database (`pg_dump` custom format) into the
`postgres_backups` volume right after start and then every `BACKUP_INTERVAL_SECONDS`
(default 24 h), deleting dumps older than `BACKUP_RETENTION_DAYS` (default 14). CI
restores such a dump on every run. Script details: `docs/database.md` → "Backups".

The dumps live **on the same disk** as the database (ADR-031). Copy them off the host —
for example a daily cron on the host:

```sh
docker run --rm -v coffeeride_postgres_backups:/b:ro -v /srv/offsite:/out alpine \
  sh -c 'cp -n /b/*.dump /out/'
```

followed by `rsync`/`rclone` of `/srv/offsite` to another machine or object store. (The
volume name is `<project>_postgres_backups`; the project defaults to the checkout's
directory name — `docker volume ls` shows it.) Restore:

```sh
dc run --rm --no-deps -v "$PWD/packages/db/scripts/restore.sh:/restore.sh:ro" \
  --entrypoint bash backup /restore.sh /backups/coffee_ride_<timestamp>.dump
```

Uploaded files (covers, avatars, GPX) live in the `s3_data` volume; back it up the same
way if losing them matters.

## Managed services instead

To use managed Postgres/Redis/S3, drop `-f docker-compose.infra.yml` (edit the
`COMPOSE` line in `deploy/deploy.sh` and remove its `s3-init` step), and set
`DATABASE_URL`, `REDIS_URL` and `S3_*` in `.env` to the provider's values. Nothing in
`docker-compose.prod.yml` changes.

## Known limitations

- Caddy's certificate issuance needs the real domain and host — no sandbox or CI run
  covers it (KI-045, `deploy/FIRST-DEPLOY.md` §3).
- Client IPs through the Caddy → web → api hop (KI-044, resolved CR-145): Caddy
  overwrites X-Forwarded-For with the client address, Next's rewrite forwards it, and
  `api` trusts exactly one private hop (`TRUST_PROXY_HOPS: 1`). `deploy/smoke/run.sh`
  checks it through the prod images. Keep `api` without `ports:`; see
  `apps/api/src/env.ts` before changing either.
- One host is one failure domain (ADR-031): off-host backup copies are an operator task.
