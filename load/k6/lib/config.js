// CR-139. Shared config for every scenario — a single BASE_URL so scenarios
// can point at a local dev API, a staging deploy, or a CI-started instance
// without editing script bodies.

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// Deliberately no Origin/Referer header anywhere in this suite: apps/api's
// CSRF check (apps/api/src/plugins/csrf.ts, ADR-013) only rejects an unsafe
// method when Origin/Referer is present AND mismatched — neither header
// present is an allowed, non-browser API client, which is exactly what k6 is.
export const JSON_HEADERS = { 'Content-Type': 'application/json' };
