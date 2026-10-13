import { describe, expect, it } from 'vitest';
import {
  createOAuthState,
  OAUTH_STATE_TTL_MS,
  readOAuthState,
} from './oauth-state.js';

const SECRET = 'a-test-only-secret';
const PAYLOAD = { userId: 'user-1', rideId: 'ride-1' };

describe('Strava OAuth state', () => {
  it('round-trips the payload', () => {
    expect(readOAuthState(SECRET, createOAuthState(SECRET, PAYLOAD))).toEqual({
      ...PAYLOAD,
      expired: false,
    });
  });

  it('is different every time (nonce)', () => {
    expect(createOAuthState(SECRET, PAYLOAD)).not.toBe(
      createOAuthState(SECRET, PAYLOAD),
    );
  });

  it('expires after the TTL', () => {
    const issued = new Date('2026-10-11T10:00:00.000Z');
    const state = createOAuthState(SECRET, PAYLOAD, issued);
    const justBefore = new Date(issued.getTime() + OAUTH_STATE_TTL_MS - 1);
    const after = new Date(issued.getTime() + OAUTH_STATE_TTL_MS);
    expect(readOAuthState(SECRET, state, justBefore)).toEqual({
      ...PAYLOAD,
      expired: false,
    });
    // Still genuine, so the callback can send the participant back to the ride.
    expect(readOAuthState(SECRET, state, after)).toEqual({
      ...PAYLOAD,
      expired: true,
    });
  });

  it('rejects another secret, a tampered body and junk', () => {
    const state = createOAuthState(SECRET, PAYLOAD);
    expect(readOAuthState('another-secret', state)).toBeNull();

    const [, signature] = state.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ u: 'attacker', r: 'ride-1', e: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(readOAuthState(SECRET, `${forgedBody}.${signature}`)).toBeNull();

    expect(readOAuthState(SECRET, '')).toBeNull();
    expect(readOAuthState(SECRET, 'a.b.c')).toBeNull();
    expect(readOAuthState(SECRET, 'not-a-state')).toBeNull();
  });
});
