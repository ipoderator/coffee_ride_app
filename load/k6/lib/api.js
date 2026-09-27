// CR-139. Thin HTTP helpers over the same REST flow
// apps/web/e2e/helpers/api-fixtures.ts already scripts for Playwright
// (register -> verify -> login -> organizer profile -> ride lifecycle), ported
// to k6's http module. k6 gives every VU its own cookie jar automatically, so
// a `login()` call's session cookie is reused by later calls from the same VU
// without any extra plumbing.

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, JSON_HEADERS } from './config.js';

export const PASSWORD = 'a-strong-load-test-password-123';

/** Throws with the response body on failure — for fixture/setup calls where a
 * non-2xx means the scenario can't run at all, not a result to measure. */
function assertOk(res, action) {
  const ok = check(res, {
    [`${action}: ok`]: (r) => r.status >= 200 && r.status < 300,
  });
  if (!ok) {
    throw new Error(`${action} failed: ${res.status} ${res.body}`);
  }
  return res;
}

// Not __VU/__ITER: both are undefined inside setup()/teardown(), where most
// accounts in this suite get created.
let emailCounter = 0;

/** Unique enough across VUs/iterations/setup() without a real UUID lib (k6's
 * JS runtime has no Node crypto). */
export function uniqueEmail(tag = 'user') {
  emailCounter += 1;
  return `loadtest-${tag}-${emailCounter}-${Date.now()}-${Math.floor(
    Math.random() * 1e9,
  )}@example.test`;
}

/** Registers and verifies a fresh account — mirrors
 * api-fixtures.ts's registerAndVerify. Returns the new user's id alongside
 * the credentials so callers can match accounts to API responses later. */
export function registerAndVerify(email = uniqueEmail(), password = PASSWORD) {
  const register = assertOk(
    http.post(
      `${BASE_URL}/v1/auth/register`,
      JSON.stringify({ email, password }),
      { headers: JSON_HEADERS },
    ),
    'register',
  );
  const body = register.json();
  // k6's JS runtime has no URL/URLSearchParams global; verificationUrl is
  // always exactly `/v1/auth/verify-email?token=<token>` (auth.routes.ts), so
  // a plain split is enough.
  const token = body.verificationUrl.split('token=')[1];
  assertOk(
    http.post(`${BASE_URL}/v1/auth/verify-email`, JSON.stringify({ token }), {
      headers: JSON_HEADERS,
    }),
    'verify-email',
  );
  return { email, password, userId: body.user.id };
}

export function login(email, password = PASSWORD) {
  return assertOk(
    http.post(
      `${BASE_URL}/v1/auth/login`,
      JSON.stringify({ email, password }),
      {
        headers: JSON_HEADERS,
      },
    ),
    'login',
  );
}

export function createOrganizerProfile(name) {
  return assertOk(
    http.post(`${BASE_URL}/v1/organizers/me`, JSON.stringify({ name }), {
      headers: JSON_HEADERS,
    }),
    'create organizer profile',
  );
}

export function createDraftRide(title, startsInMs = 14 * 24 * 60 * 60 * 1000) {
  const startsAt = new Date(Date.now() + startsInMs).toISOString();
  const res = assertOk(
    http.post(
      `${BASE_URL}/v1/rides`,
      JSON.stringify({
        title,
        bicycleType: 'gravel',
        startsAt,
        startTimezone: 'Europe/Moscow',
      }),
      { headers: JSON_HEADERS },
    ),
    'create ride',
  );
  return res.json().ride.id;
}

export function setParticipantLimit(rideId, limit) {
  assertOk(
    http.patch(
      `${BASE_URL}/v1/rides/${rideId}`,
      JSON.stringify({ participantLimit: limit }),
      { headers: JSON_HEADERS },
    ),
    'set participant limit',
  );
}

export function publishRide(rideId) {
  assertOk(http.post(`${BASE_URL}/v1/rides/${rideId}/publish`), 'publish ride');
}

export function openRegistration(rideId) {
  assertOk(
    http.post(`${BASE_URL}/v1/rides/${rideId}/open-registration`),
    'open registration',
  );
}

/** Draft -> published -> registration_open, optionally capacity-limited —
 * mirrors api-fixtures.ts's createPublishedRide. Requires an organizer
 * session already logged in on this VU/setup context. */
export function createPublishedRide(title, options = {}) {
  const rideId = createDraftRide(title, options.startsInMs);
  if (options.participantLimit !== undefined) {
    setParticipantLimit(rideId, options.participantLimit);
  }
  publishRide(rideId);
  openRegistration(rideId);
  return rideId;
}

// The four calls below deliberately do NOT assertOk: a 409 (ride_full,
// registration_already_exists, waitlist_entry_already_exists, ...) is a
// meaningful, expected outcome under concurrency, not a fixture failure —
// callers classify the raw response themselves.

export function registerForRide(rideId) {
  return http.post(`${BASE_URL}/v1/rides/${rideId}/register`);
}

export function joinWaitlist(rideId) {
  return http.post(`${BASE_URL}/v1/rides/${rideId}/waitlist`);
}

export function cancelRegistration(rideId) {
  return http.del(`${BASE_URL}/v1/rides/${rideId}/register`);
}

export function listParticipants(rideId, limit = 100) {
  return assertOk(
    http.get(`${BASE_URL}/v1/rides/${rideId}/participants?limit=${limit}`),
    'list participants',
  ).json();
}

export function listWaitlist(rideId, limit = 100) {
  return assertOk(
    http.get(`${BASE_URL}/v1/rides/${rideId}/waitlist?limit=${limit}`),
    'list waitlist',
  ).json();
}
