// CR-139. Race condition on waitlist promotion: CAPACITY participants cancel
// their registration at the same instant, each cancellation's transaction
// (registrations.service.ts) must promote exactly one FIFO waitlist entry per
// freed slot, atomically — no double-promotion of the same entry, no
// promoted-but-still-`waiting` entry, and the ride never exceeds CAPACITY
// active registrations even mid-race.
//
// WAITLIST > CAPACITY by default so the run also checks FIFO order, not just
// the count: after the race, the promoted participants must be exactly the
// first CAPACITY accounts that joined the waitlist, in join order.
//
// Same AUTH_RATE_LIMIT_MAX caveat as last-slot-registration.js — see
// ../../README.md.
//
//   k6 run -e BASE_URL=http://localhost:4000 -e CAPACITY=3 -e WAITLIST=5 \
//     load/k6/scenarios/waitlist-promotion-race.js

import { check } from 'k6';
import {
  registerAndVerify,
  login,
  createOrganizerProfile,
  createPublishedRide,
  registerForRide,
  joinWaitlist,
  cancelRegistration,
  listParticipants,
  listWaitlist,
} from '../lib/api.js';

const CAPACITY = Number(__ENV.CAPACITY || 3);
const WAITLIST = Number(__ENV.WAITLIST || 5);

export const options = {
  setupTimeout: '3m',
  teardownTimeout: '1m',
  scenarios: {
    race: {
      executor: 'per-vu-iterations',
      vus: CAPACITY,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  // Every invariant below is asserted with check() in teardown(); this is
  // what actually fails the run (and the process exit code) if one doesn't
  // hold, the same way the exact-count thresholds do in the other scenarios.
  thresholds: {
    checks: ['rate==1'],
  },
};

export function setup() {
  if (WAITLIST < CAPACITY) {
    throw new Error('WAITLIST must be >= CAPACITY for a deterministic check');
  }

  const organizer = registerAndVerify();
  login(organizer.email, organizer.password);
  createOrganizerProfile(`Load Test Organizer ${Date.now()}`);
  const rideId = createPublishedRide(`Waitlist race ${Date.now()}`, {
    participantLimit: CAPACITY,
  });

  const fillers = [];
  for (let i = 0; i < CAPACITY; i++) {
    const account = registerAndVerify();
    login(account.email, account.password);
    const res = registerForRide(rideId);
    if (res.status !== 201) {
      throw new Error(`filler registration failed: ${res.status} ${res.body}`);
    }
    fillers.push(account);
  }

  // Strict join order — this is what FIFO correctness is checked against.
  const waitlisters = [];
  for (let i = 0; i < WAITLIST; i++) {
    const account = registerAndVerify();
    login(account.email, account.password);
    const res = joinWaitlist(rideId);
    if (res.status !== 201) {
      throw new Error(`waitlist join failed: ${res.status} ${res.body}`);
    }
    waitlisters.push(account);
  }

  return { rideId, organizer, fillers, waitlisters };
}

export default function (data) {
  const filler = data.fillers[(__VU - 1) % data.fillers.length];
  login(filler.email, filler.password);
  const res = cancelRegistration(data.rideId);
  check(res, {
    'cancel registration ok': (r) => r.status === 204,
  });
}

export function teardown(data) {
  login(data.organizer.email, data.organizer.password);
  const participants = listParticipants(data.rideId).items;
  const waiting = listWaitlist(data.rideId).items;

  const expectedPromoted = data.waitlisters
    .slice(0, CAPACITY)
    .map((a) => a.userId)
    .sort();
  const expectedStillWaiting = data.waitlisters
    .slice(CAPACITY)
    .map((a) => a.userId)
    .sort();
  const actualPromoted = participants.map((p) => p.userId).sort();
  const actualStillWaiting = waiting.map((w) => w.userId).sort();

  check(null, {
    'ride backfilled to exactly capacity': () =>
      participants.length === CAPACITY,
    'remaining waitlist has exactly WAITLIST - CAPACITY entries': () =>
      waiting.length === WAITLIST - CAPACITY,
    'promoted set matches the oldest WAITLIST entries (FIFO), no duplicates':
      () => JSON.stringify(actualPromoted) === JSON.stringify(expectedPromoted),
    'entries left waiting are exactly the newest ones, none double-promoted':
      () =>
        JSON.stringify(actualStillWaiting) ===
        JSON.stringify(expectedStillWaiting),
  });
}
