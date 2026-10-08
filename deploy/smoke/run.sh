#!/usr/bin/env bash
# CR-134. Production Docker smoke test: builds the real `api`/`web` (and
# `migrate`) images from docker-compose.prod.yml, runs them on one Compose
# network with a disposable Postgres, and requires GET /api/v1/rides *through
# web* to return 200 with a real API body.
#
# Guards against the bug that motivated it: web's `/api/v1/*` rewrite
# (apps/web/next.config.ts) is resolved at `next build` time, so an image
# built without API_INTERNAL_URL proxied to localhost:4000 inside the web
# container — ECONNREFUSED, a 500 on every API call — no matter what the
# runtime environment said.
#
# Also asserts `api` publishes no host port (ADR-018 §2: reachable only over
# the Compose network). Usage: `pnpm smoke:docker` (needs a running Docker).
#
# CR-218 (ADR-031): runs with docker-compose.infra.yml layered in, as a deploy
# does — so it also proves Postgres/Redis/S3 come up and `api` reaches all three
# (`GET /health`), and that a `backup` dump restores into a fresh database.
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE=(docker compose
  -f docker-compose.prod.yml
  -f docker-compose.infra.yml
  -f deploy/smoke/docker-compose.smoke.yml
  --env-file deploy/smoke/smoke.env
  --profile migrate)

PROBE_URL='http://web:3000/api/v1/rides'
PROBE_ATTEMPTS=60 # × 2 s

succeeded=0
cleanup() {
  if [ "$succeeded" -ne 1 ]; then
    echo '--- smoke test failed; container logs follow ---' >&2
    "${COMPOSE[@]}" logs --no-color --tail=200 api web >&2 || true
  fi
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo '==> Building images (api, web, migrate)'
"${COMPOSE[@]}" build api web migrate

echo '==> Starting Postgres, Redis and S3; creating the bucket; applying migrations'
"${COMPOSE[@]}" up -d --wait postgres redis s3
"${COMPOSE[@]}" run --rm s3-init
"${COMPOSE[@]}" run --rm migrate

echo '==> Starting api and web'
"${COMPOSE[@]}" up -d api web

echo '==> Checking api publishes no host port'
api_container="$("${COMPOSE[@]}" ps -q api)"
api_published="$(docker port "$api_container")"
if [ -n "$api_published" ]; then
  echo "FAIL: api must not be reachable from the host, but publishes: $api_published" >&2
  exit 1
fi

# Runs inside the web container and resolves `web` through Compose DNS — the
# same hop Caddy makes in production. Exit 0 only for 200 + `{ items: [] }`
# (ADR-011's collection shape), so a 200 from something that isn't the API
# can't pass.
probe_js="
fetch('$PROBE_URL')
  .then(async (res) => {
    const text = await res.text();
    let ok = res.status === 200;
    try { ok = ok && Array.isArray(JSON.parse(text).items); } catch { ok = false; }
    console.log(res.status + ' ' + text.slice(0, 300));
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => { console.log('request error: ' + err.message); process.exit(1); });
"

echo "==> Probing GET $PROBE_URL through web"
last=''
probe_ok=0
for _ in $(seq 1 "$PROBE_ATTEMPTS"); do
  if last="$("${COMPOSE[@]}" exec -T web node -e "$probe_js" 2>&1)"; then
    echo "OK: $last"
    probe_ok=1
    break
  fi
  sleep 2
done

if [ "$probe_ok" -ne 1 ]; then
  echo "FAIL: expected 200 with an { items } body, last response: $last" >&2
  exit 1
fi

# KI-044: the per-IP rate limiter must key on the client address Caddy writes
# into X-Forwarded-For, not on `web`'s one internal IP. This request plays
# Caddy: client A twice, A again behind a forged left entry, then client B.
# A's bucket must keep counting down across all three; B must start fresh.
xff_js="
const remaining = async (xff) => {
  const res = await fetch('$PROBE_URL', { headers: { 'x-forwarded-for': xff } });
  return Number(res.headers.get('x-ratelimit-remaining'));
};
(async () => {
  const a1 = await remaining('203.0.113.7');
  const a2 = await remaining('203.0.113.7');
  const aForged = await remaining('6.6.6.6, 203.0.113.7');
  const b1 = await remaining('203.0.113.9');
  console.log(JSON.stringify({ a1, a2, aForged, b1 }));
  process.exit(a2 === a1 - 1 && aForged === a1 - 2 && b1 > aForged ? 0 : 1);
})().catch((err) => { console.log('request error: ' + err.message); process.exit(1); });
"
echo '==> Checking the rate limiter sees client addresses through web (KI-044)'
if ! xff_result="$("${COMPOSE[@]}" exec -T web node -e "$xff_js" 2>&1)"; then
  echo "FAIL: per-client rate-limit buckets through web, got: $xff_result" >&2
  exit 1
fi
echo "OK: $xff_result"

health_js="
fetch('http://api:4000/health')
  .then(async (res) => {
    const body = await res.json();
    console.log(JSON.stringify(body));
    const d = body.dependencies;
    process.exit(body.status === 'ok' && d.db === 'ok' && d.redis === 'ok' && d.s3 === 'ok' ? 0 : 1);
  })
  .catch((err) => { console.log('request error: ' + err.message); process.exit(1); });
"
echo '==> Checking api reaches Postgres, Redis and S3 (GET /health)'
if ! health_result="$("${COMPOSE[@]}" exec -T web node -e "$health_js" 2>&1)"; then
  echo "FAIL: expected every dependency ok, got: $health_result" >&2
  exit 1
fi
echo "OK: $health_result"

echo '==> Backing up with the backup service and restoring into a fresh database'
"${COMPOSE[@]}" run --rm --no-deps --entrypoint /scripts/backup.sh backup
"${COMPOSE[@]}" exec -T postgres psql -U coffee_ride -d coffee_ride -qc 'CREATE DATABASE restore_check'
restore_out="$("${COMPOSE[@]}" run --rm --no-deps \
  -v "$PWD/packages/db/scripts/restore.sh:/scripts/restore.sh:ro" \
  --entrypoint sh backup -c '
    set -eu
    latest="$(ls -1 /backups/coffee_ride_*.dump | tail -n 1)"
    target="${DATABASE_URL%/*}/restore_check"
    DATABASE_URL="$target" bash /scripts/restore.sh "$latest"
    psql "$target" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations"
  ' 2>&1)" || {
  echo "FAIL: backup/restore round trip: $restore_out" >&2
  exit 1
}
migrations_restored="$(printf '%s\n' "$restore_out" | tail -n 1)"
if ! [ "$migrations_restored" -gt 0 ] 2>/dev/null; then
  echo "FAIL: restored database has no migration history: $restore_out" >&2
  exit 1
fi
echo "OK: restored $migrations_restored applied migrations from the dump"
succeeded=1
