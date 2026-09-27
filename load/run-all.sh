#!/usr/bin/env bash
# CR-139. Runs every load-test scenario in sequence against BASE_URL.
#
#   BASE_URL=http://localhost:4000 ./load/run-all.sh
#   SCENARIO=last-slot-registration ./load/run-all.sh   # just one
#
# See load/README.md for what target each scenario needs (AUTH_RATE_LIMIT_MAX/
# RATE_LIMIT_MAX raised, except rate-limiting.js which needs the opposite).

set -euo pipefail

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed. Install it (e.g. 'brew install k6' on macOS," >&2
  echo "or see https://k6.io/ for other platforms) and re-run." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BASE_URL="${BASE_URL:-http://localhost:4000}"

ALL_SCENARIOS=(
  rate-limiting
  last-slot-registration
  waitlist-promotion-race
  bulk-ride-list
  gpx-large-route
  api-latency
)

if [ -n "${SCENARIO:-}" ]; then
  SCENARIOS=("$SCENARIO")
else
  SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

for name in "${SCENARIOS[@]}"; do
  echo ""
  echo "=== $name (target: $BASE_URL) ==="
  k6 run "$SCRIPT_DIR/k6/scenarios/$name.js"
done
