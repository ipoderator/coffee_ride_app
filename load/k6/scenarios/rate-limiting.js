// CR-139. Rate limiting must actually reject beyond its threshold under real
// concurrent load, not just in a mocked-clock unit test
// (auth.routes.test.ts). Two independent tiers (.claude/rules/security.md):
//
//   - per-IP auth tier on /v1/auth/login (AUTH_RATE_LIMIT_DEFAULTS, 5/min);
//   - the global per-IP tier on an ordinary endpoint (RATE_LIMIT_MAX, 100/min).
//
// Run this scenario against a target WITHOUT AUTH_RATE_LIMIT_MAX/
// RATE_LIMIT_MAX overridden — every other scenario in this suite needs those
// raised (see ../../README.md), which would make this one measure nothing.
//
//   k6 run -e BASE_URL=http://localhost:4000 load/k6/scenarios/rate-limiting.js

import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { BASE_URL, JSON_HEADERS } from '../lib/config.js';

const LOGIN_ATTEMPTS = Number(__ENV.LOGIN_ATTEMPTS || 20);
const GLOBAL_ATTEMPTS = Number(__ENV.GLOBAL_ATTEMPTS || 150);

const loginUnauthorized = new Counter('login_unauthorized');
const loginRateLimited = new Counter('login_rate_limited');
const loginOther = new Counter('login_other');
const globalOk = new Counter('global_ok');
const globalRateLimited = new Counter('global_rate_limited');
const globalOther = new Counter('global_other');

export const options = {
  scenarios: {
    login_burst: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: LOGIN_ATTEMPTS,
      exec: 'loginBurst',
      maxDuration: '30s',
    },
    // Starts well after login_burst's own 1-minute window has fully elapsed
    // so the two bursts can never share a rate-limit window if a slow CI
    // runner drags login_burst out.
    global_burst: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: GLOBAL_ATTEMPTS,
      exec: 'globalBurst',
      startTime: '70s',
      maxDuration: '30s',
    },
  },
  thresholds: {
    // A known-bad password never reveals account existence (security.md) —
    // every non-rate-limited attempt must be the same generic 401.
    login_unauthorized: ['count>=1'],
    login_rate_limited: ['count>=1'],
    login_other: ['count<=0'],
    global_ok: ['count>=1'],
    global_rate_limited: ['count>=1'],
    global_other: ['count<=0'],
  },
};

// A fixed, never-registered account: login always answers 401 (or 429 once
// limited) without ever creating state, so this scenario can run repeatedly.
const LOGIN_PROBE = {
  email: 'load-test-rate-limit-probe@example.test',
  password: 'definitely-the-wrong-password-123',
};

export function loginBurst() {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify(LOGIN_PROBE),
    { headers: JSON_HEADERS },
  );
  if (res.status === 401) {
    loginUnauthorized.add(1);
  } else if (res.status === 429) {
    loginRateLimited.add(1);
  } else {
    loginOther.add(1);
    console.error(`unexpected login-burst status: ${res.status} ${res.body}`);
  }
}

export function globalBurst() {
  const res = http.get(`${BASE_URL}/v1/rides?limit=1`);
  if (res.status === 200) {
    globalOk.add(1);
  } else if (res.status === 429) {
    globalRateLimited.add(1);
  } else {
    globalOther.add(1);
    console.error(`unexpected global-burst status: ${res.status} ${res.body}`);
  }
}
