#!/usr/bin/env bash
# CR-218 (ADR-031). Deploys or updates Coffee Ride on a single host: the
# application (docker-compose.prod.yml) plus its data services
# (docker-compose.infra.yml). Run from anywhere on the server, after filling in
# `.env` from deploy/production.env.example:
#
#   deploy/deploy.sh
#
# Order matters and is the one docs/deployment.md describes: build first (a
# failed build changes nothing that is running), data services up and healthy,
# bucket ensured, migrations applied, then the application rolled. Re-running it
# is the update procedure — every step is idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo 'No .env next to docker-compose.prod.yml — copy deploy/production.env.example to .env and fill it in.' >&2
  exit 1
fi

# The values a broken deploy would otherwise only reveal at runtime.
missing=()
for key in DOMAIN ACME_EMAIL AUTH_SECRET POSTGRES_PASSWORD REDIS_PASSWORD \
  S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET; do
  value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
  if [ -z "$value" ]; then
    missing+=("$key")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Empty in .env: ${missing[*]}" >&2
  exit 1
fi

COMPOSE=(docker compose
  -f docker-compose.prod.yml
  -f docker-compose.infra.yml
  --env-file .env)

echo '==> Building images'
"${COMPOSE[@]}" --profile migrate build

echo '==> Starting Postgres, Redis and S3'
"${COMPOSE[@]}" up -d --wait postgres redis s3

echo '==> Ensuring the storage bucket exists'
"${COMPOSE[@]}" run --rm s3-init

echo '==> Applying database migrations'
"${COMPOSE[@]}" --profile migrate run --rm migrate

echo '==> Starting the application'
"${COMPOSE[@]}" up -d --remove-orphans

"${COMPOSE[@]}" ps

# apps/api logs its configuration warnings at boot (CR-210's preflight tier) —
# a feature that boots but cannot work, e.g. email without a verified sender.
sleep 5
warnings="$("${COMPOSE[@]}" logs --no-log-prefix api 2>/dev/null | grep '"preflight":true' || true)"
if [ -n "$warnings" ]; then
  echo '==> Configuration warnings from api (the site runs, but these features do not):'
  printf '%s\n' "$warnings"
fi

echo "==> Done. Check https://$(grep -E '^DOMAIN=' .env | tail -n 1 | cut -d= -f2-)/ and deploy/FIRST-DEPLOY.md on a first deploy."
