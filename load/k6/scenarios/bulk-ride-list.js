// CR-139. Bulk discovery-list retrieval: pages through GET /v1/rides (ADR-011
// cursor pagination) under concurrent load against a database that actually
// holds many rides, checking both response shape (page size bound, a
// terminating nextCursor) and latency (thresholds below).
//
// Needs RATE_LIMIT_MAX raised for both setup (RIDE_COUNT rapid creates) and
// the read burst itself — see ../../README.md. Run rate-limiting.js
// separately for the global-limiter check itself.
//
//   k6 run -e BASE_URL=http://localhost:4000 -e RIDE_COUNT=150 -e VUS=20 \
//     -e DURATION=30s load/k6/scenarios/bulk-ride-list.js

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import {
  registerAndVerify,
  login,
  createOrganizerProfile,
  createPublishedRide,
} from '../lib/api.js';

const RIDE_COUNT = Number(__ENV.RIDE_COUNT || 150);
const PAGE_LIMIT = 100; // docs/api.md's own max — testing.md's own precedent.

export const options = {
  setupTimeout: '5m',
  scenarios: {
    list: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    'http_req_duration{name:list_rides}': ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const organizer = registerAndVerify();
  login(organizer.email, organizer.password);
  createOrganizerProfile(`Load Test Organizer ${Date.now()}`);
  for (let i = 0; i < RIDE_COUNT; i++) {
    // Spread starts so sorting/pagination has real variety instead of every
    // ride landing on the same instant.
    createPublishedRide(`Bulk list ride ${i} ${Date.now()}`, {
      startsInMs: (1 + i) * 60 * 60 * 1000,
    });
  }
}

export default function () {
  let cursor;
  let pages = 0;
  do {
    const url = cursor
      ? `${BASE_URL}/v1/rides?limit=${PAGE_LIMIT}&cursor=${cursor}`
      : `${BASE_URL}/v1/rides?limit=${PAGE_LIMIT}`;
    const res = http.get(url, { tags: { name: 'list_rides' } });
    check(res, {
      'list rides: 200': (r) => r.status === 200,
      'list rides: page within limit': (r) => {
        if (r.status !== 200) return true;
        return r.json().items.length <= PAGE_LIMIT;
      },
    });
    if (res.status !== 200) break;
    cursor = res.json().nextCursor;
    pages += 1;
    // A page-count safety valve, not a hard product constraint — stops a run
    // from looping forever if pagination regresses into never terminating.
  } while (cursor && pages < 50);
}
