import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';

// CR-092. Seeds state via direct API calls (register/verify/login/organizer
// profile/ride lifecycle) so each critical-journey spec only drives the UI for
// the journey it's actually testing, not every precondition — same "real
// fixtures via API, not through the UI for every step" scope `docs/tasks.md`
// records for this ticket. Hits `/api/v1/...` (apps/web's own rewrite), the
// same path a real browser session uses, so a `login()` call's session cookie
// is directly reusable by `page.goto(...)` when `request` is `page.request`.

const WEB_ORIGIN = 'http://localhost:3000';
// Every unsafe method needs this — same CSRF Origin/Referer check
// (`apps/api/src/plugins/csrf.ts`, ADR-013) a real same-origin browser fetch
// satisfies automatically; Playwright's raw APIRequestContext does not send
// an Origin header on its own.
const UNSAFE_HEADERS = { origin: WEB_ORIGIN };

/**
 * Every fixture call below assumes success — a failure (e.g. the shared
 * `/v1/auth/*` in-memory rate limit, KI-014, tripped by back-to-back local
 * runs within the same minute) must surface as a clear error here, not as a
 * confusing `Cannot read properties of undefined` several calls downstream
 * once a malformed/empty body gets destructured.
 */
async function assertOk(response: APIResponse, action: string): Promise<void> {
  if (!response.ok()) {
    throw new Error(
      `${action} failed: ${response.status()} ${await response.text()}`,
    );
  }
}

export function uniqueEmail(): string {
  return `${randomUUID()}@example.test`;
}

export const E2E_PASSWORD = 'a-strong-e2e-password-123';

/**
 * Registers and verifies a fresh account (no organizer profile). No UI path
 * exists for email verification (KI-026) — this is the only way to get a
 * usable account at all, in tests or in real use.
 */
export async function registerAndVerify(
  request: APIRequestContext,
  email: string = uniqueEmail(),
  password: string = E2E_PASSWORD,
): Promise<{ email: string; password: string; userId: string }> {
  const register = await request.post('/api/v1/auth/register', {
    headers: UNSAFE_HEADERS,
    data: { email, password },
  });
  await assertOk(register, 'register');
  const { user, verificationUrl } = (await register.json()) as {
    user: { id: string };
    verificationUrl: string;
  };
  const token = new URL(verificationUrl, 'http://internal').searchParams.get(
    'token',
  );
  const verify = await request.post('/api/v1/auth/verify-email', {
    headers: UNSAFE_HEADERS,
    data: { token },
  });
  await assertOk(verify, 'verify-email');
  return { email, password, userId: user.id };
}

/** Logs in on the given context — sets a session cookie in its cookie jar. */
export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const response = await request.post('/api/v1/auth/login', {
    headers: UNSAFE_HEADERS,
    data: { email, password },
  });
  await assertOk(response, 'login');
}

/** Requires `request` to already carry a logged-in session. */
export async function createOrganizerProfile(
  request: APIRequestContext,
  name: string,
): Promise<void> {
  const response = await request.post('/api/v1/organizers/me', {
    headers: UNSAFE_HEADERS,
    data: { name },
  });
  await assertOk(response, 'create organizer profile');
}

/**
 * Creates a draft ride, publishes it, and opens registration — the state a
 * "discover and register" or "view participants" spec needs as a given, not
 * as the thing it's testing. Requires `request` to carry a logged-in
 * organizer session with a profile (see {@link createOrganizerProfile}).
 */
export async function createPublishedRide(
  request: APIRequestContext,
  title: string,
  options: { participantLimit?: number; startsInMs?: number } = {},
): Promise<{ rideId: string }> {
  const { rideId } = await createDraftRide(request, title, options.startsInMs);
  if (options.participantLimit !== undefined) {
    // Only a draft is editable (`RIDE_EDIT_TERMS.notEditable`).
    const patched = await request.patch(`/api/v1/rides/${rideId}`, {
      headers: UNSAFE_HEADERS,
      data: { participantLimit: options.participantLimit },
    });
    await assertOk(patched, 'set participant limit');
  }

  const published = await request.post(`/api/v1/rides/${rideId}/publish`, {
    headers: UNSAFE_HEADERS,
  });
  await assertOk(published, 'publish ride');
  const opened = await request.post(
    `/api/v1/rides/${rideId}/open-registration`,
    { headers: UNSAFE_HEADERS },
  );
  await assertOk(opened, 'open registration');

  return { rideId };
}

/**
 * CR-135. A ride left in `draft` — for specs that drive the lifecycle
 * themselves. Same organizer-session requirement as {@link createPublishedRide}.
 */
export async function createDraftRide(
  request: APIRequestContext,
  title: string,
  startsInMs: number = 14 * 24 * 60 * 60 * 1000,
): Promise<{ rideId: string }> {
  const startsAt = new Date(Date.now() + startsInMs).toISOString();

  const created = await request.post('/api/v1/rides', {
    headers: UNSAFE_HEADERS,
    data: {
      title,
      bicycleType: 'gravel',
      startsAt,
      startTimezone: 'Europe/Moscow',
    },
  });
  await assertOk(created, 'create ride');
  const { ride } = (await created.json()) as { ride: { id: string } };
  return { rideId: ride.id };
}

/** CR-135. Organizer-only; returns the new pace group's id. */
export async function createRideGroup(
  request: APIRequestContext,
  rideId: string,
  name: string,
  paceKmh: number,
): Promise<{ groupId: string }> {
  const response = await request.post(`/api/v1/rides/${rideId}/groups`, {
    headers: UNSAFE_HEADERS,
    data: { name, paceKmh },
  });
  await assertOk(response, 'create ride group');
  const { group } = (await response.json()) as { group: { id: string } };
  return { groupId: group.id };
}

/** Requires `request` to already carry a logged-in session. */
export async function registerForRide(
  request: APIRequestContext,
  rideId: string,
  groupId?: string,
): Promise<{ registrationId: string }> {
  const response = await request.post(`/api/v1/rides/${rideId}/register`, {
    headers: UNSAFE_HEADERS,
    ...(groupId ? { data: { groupId } } : {}),
  });
  await assertOk(response, 'register for ride');
  const { registration } = (await response.json()) as {
    registration: { id: string };
  };
  return { registrationId: registration.id };
}

/** CR-135. Requires `request` to already carry a logged-in session. */
export async function joinWaitlist(
  request: APIRequestContext,
  rideId: string,
): Promise<void> {
  const response = await request.post(`/api/v1/rides/${rideId}/waitlist`, {
    headers: UNSAFE_HEADERS,
  });
  await assertOk(response, 'join waitlist');
}

/** CR-135. Organizer-only; fans out a `ride_update` notification. */
export async function postRideUpdate(
  request: APIRequestContext,
  rideId: string,
  message: string,
): Promise<void> {
  const response = await request.post(`/api/v1/rides/${rideId}/updates`, {
    headers: UNSAFE_HEADERS,
    data: { message },
  });
  await assertOk(response, 'post ride update');
}

/** CR-135. Organizer-only; fans out a `ride_cancelled` notification. */
export async function cancelRide(
  request: APIRequestContext,
  rideId: string,
): Promise<void> {
  const response = await request.post(`/api/v1/rides/${rideId}/cancel`, {
    headers: UNSAFE_HEADERS,
  });
  await assertOk(response, 'cancel ride');
}

/** Requires `request` to already carry a logged-in session. */
export async function setDisplayName(
  request: APIRequestContext,
  displayName: string,
): Promise<void> {
  await updateMe(request, { displayName });
}

/** CR-135. `PATCH /v1/users/me` with any profile fields. */
export async function updateMe(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await request.patch('/api/v1/users/me', {
    headers: UNSAFE_HEADERS,
    data,
  });
  await assertOk(response, 'update profile');
}

/**
 * CR-135. Raw unsafe-method call for specs asserting a *rejection* — carries
 * the CSRF `Origin` header, so a 403/404 is the server's authorization answer,
 * not the CSRF check's.
 */
export function unsafeRequest(
  request: APIRequestContext,
  method: 'post' | 'patch' | 'delete',
  url: string,
  data?: unknown,
): Promise<APIResponse> {
  return request[method](url, {
    headers: UNSAFE_HEADERS,
    ...(data === undefined ? {} : { data }),
  });
}
