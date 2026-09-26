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
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE=(docker compose
  -f docker-compose.prod.yml
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

echo '==> Starting Postgres and applying migrations'
"${COMPOSE[@]}" up -d --wait postgres
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
for _ in $(seq 1 "$PROBE_ATTEMPTS"); do
  if last="$("${COMPOSE[@]}" exec -T web node -e "$probe_js" 2>&1)"; then
    echo "OK: $last"
    succeeded=1
    exit 0
  fi
  sleep 2
done

echo "FAIL: expected 200 with an { items } body, last response: $last" >&2
exit 1
