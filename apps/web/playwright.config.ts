import { defineConfig, devices } from '@playwright/test';

// e2e config (CR-008; wired into CI + a second webServer entry by CR-080).
// Root package.json's "test:e2e" delegates here via `turbo test:e2e`.
//
// `/` has called the real GET /v1/rides through apps/web's own /api/v1/*
// rewrite since CR-024 — it is no longer a static page, so apps/api must be
// running for any spec here to work, wired into CI or not. `webServer` as an
// array (supported since Playwright 1.34) starts each entry in order,
// waiting on its own `url` before starting the next — apps/api first, then
// apps/web — instead of a hand-rolled background-process dance in CI's own
// YAML, so the exact same config works identically in local dev and CI.
//
// apps/api's entry runs `tsx` directly (no `--watch`): this is a one-shot
// process for the test run's lifetime, not a dev loop. Its env falls back to
// the same local-dev defaults docker-compose.yml/.env.example already use,
// so a developer with no exported env still gets a working e2e run the first
// time (apps/api's own `server.ts` additionally loads the root .env itself,
// but CI has no such file — these defaults plus ci.yml's real job env cover
// both cases without duplicating values here).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: '4000',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/coffee_ride',
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-local-secret',
        WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
        // KI-014: critical-journeys.spec.ts alone makes 5 register + 5 login
        // calls per run — exactly the auth tier's 5/min cap, and its counters
        // can live in Redis across API restarts, so a second run within a
        // minute got 429. Test/dev-only override (apps/api's loadEnv()
        // rejects it in production). Only reaches an API this config starts:
        // with reuseExistingServer, an already-running local dev API keeps
        // its own env — set AUTH_RATE_LIMIT_MAX in the root .env for that
        // (see .env.example).
        AUTH_RATE_LIMIT_MAX: '1000',
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
