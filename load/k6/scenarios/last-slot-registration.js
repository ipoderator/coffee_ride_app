// CR-139. Parallel registration for the last open slot(s) on a ride —
// rides.service.ts's SELECT ... FOR UPDATE row lock (CR-034/035) must let
// exactly CAPACITY registrations through and reject every other concurrent
// attempt with 409 ride_full, never over-book and never 500.
//
// Run against a target with AUTH_RATE_LIMIT_MAX raised (see ../../README.md)
// — this scenario logs in CAPACITY + EXTRA_ATTEMPTS accounts from one IP,
// which trips the real 5/min per-IP auth limit on anything but a load-test
// target. rate-limiting.js is the scenario that exercises that limit itself.
//
//   k6 run -e BASE_URL=http://localhost:4000 -e CAPACITY=5 -e EXTRA_ATTEMPTS=5 \
//     load/k6/scenarios/last-slot-registration.js

import { Counter } from 'k6/metrics';
import {
  registerAndVerify,
  login,
  createOrganizerProfile,
  createPublishedRide,
  registerForRide,
} from '../lib/api.js';

const CAPACITY = Number(__ENV.CAPACITY || 5);
const EXTRA_ATTEMPTS = Number(__ENV.EXTRA_ATTEMPTS || 5);
const TOTAL = CAPACITY + EXTRA_ATTEMPTS;

const registered = new Counter('registration_success');
const full = new Counter('registration_full');
const otherError = new Counter('registration_other_error');

export const options = {
  setupTimeout: '3m',
  scenarios: {
    race: {
      executor: 'per-vu-iterations',
      vus: TOTAL,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // Exact bounds, not just a floor: this is a correctness invariant
    // (capacity must never be exceeded), not a performance budget.
    registration_success: [`count>=${CAPACITY}`, `count<=${CAPACITY}`],
    registration_full: [`count>=${EXTRA_ATTEMPTS}`, `count<=${EXTRA_ATTEMPTS}`],
    registration_other_error: ['count<=0'],
  },
};

export function setup() {
  const organizer = registerAndVerify();
  login(organizer.email, organizer.password);
  createOrganizerProfile(`Load Test Organizer ${Date.now()}`);
  const rideId = createPublishedRide(`Last-slot race ${Date.now()}`, {
    participantLimit: CAPACITY,
  });

  const accounts = [];
  for (let i = 0; i < TOTAL; i++) {
    accounts.push(registerAndVerify());
  }

  return { rideId, accounts };
}

export default function (data) {
  const account = data.accounts[(__VU - 1) % data.accounts.length];
  login(account.email, account.password);
  const res = registerForRide(data.rideId);

  if (res.status === 201) {
    registered.add(1);
  } else if (res.status === 409 && res.json().code === 'ride_full') {
    full.add(1);
  } else {
    otherError.add(1);
    console.error(`unexpected registration outcome: ${res.status} ${res.body}`);
  }
}
