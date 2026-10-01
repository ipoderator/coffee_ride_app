// CR-139. General p95/p99 API response-time baseline under a sustained mixed
// read load — discovery list, ride detail, and health, weighted roughly like
// real participant traffic (docs/design.md's discovery -> ride card -> ride
// details UX priority). Thresholds below are a starting baseline to tune
// against real infrastructure, not a contractual SLA.
//
// Needs RATE_LIMIT_MAX raised for sustained VUs above the abuse-prevention
// default — see ../../README.md.
//
//   k6 run -e BASE_URL=http://localhost:4000 -e VUS=20 -e DURATION=1m \
//     load/k6/scenarios/api-latency.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../lib/config.js';
import {
  registerAndVerify,
  login,
  createOrganizerProfile,
  createPublishedRide,
} from '../lib/api.js';

const RIDE_COUNT = Number(__ENV.RIDE_COUNT || 10);
// Per-VU pause between requests. Without it the request rate is whatever the
// runner can push (~2 000 rps on GitHub's), which overran even the raised
// RATE_LIMIT_MAX and turned ~89 % of requests into 429s. 20 VUs at 0.5 s is
// ~40 rps (~2 400/min), well under the workflow's 10 000/min.
const THINK_TIME_S = Number(__ENV.THINK_TIME_S || 0.5);

export const options = {
  setupTimeout: '2m',
  scenarios: {
    reads: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    'http_req_duration{name:discovery_list}': ['p(95)<400', 'p(99)<900'],
    'http_req_duration{name:ride_detail}': ['p(95)<400', 'p(99)<900'],
    'http_req_duration{name:health}': ['p(95)<100', 'p(99)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const organizer = registerAndVerify();
  login(organizer.email, organizer.password);
  createOrganizerProfile(`Load Test Organizer ${Date.now()}`);
  const rideIds = [];
  for (let i = 0; i < RIDE_COUNT; i++) {
    rideIds.push(
      createPublishedRide(`Latency baseline ride ${i} ${Date.now()}`, {
        startsInMs: (1 + i) * 60 * 60 * 1000,
      }),
    );
  }
  return { rideIds };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.5) {
    const res = http.get(`${BASE_URL}/v1/rides?limit=20`, {
      tags: { name: 'discovery_list' },
    });
    check(res, { 'discovery list: 200': (r) => r.status === 200 });
  } else if (roll < 0.8) {
    const rideId =
      data.rideIds[Math.floor(Math.random() * data.rideIds.length)];
    const res = http.get(`${BASE_URL}/v1/rides/${rideId}`, {
      tags: { name: 'ride_detail' },
    });
    check(res, { 'ride detail: 200': (r) => r.status === 200 });
  } else {
    const res = http.get(`${BASE_URL}/health`, { tags: { name: 'health' } });
    check(res, { 'health: 200': (r) => r.status === 200 });
  }
  sleep(THINK_TIME_S);
}
