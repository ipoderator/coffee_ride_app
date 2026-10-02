import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// KI-085: the root .env, loaded the way `apps/api/src/server.ts` and
// `next.config.ts` load it — a variable already in the environment wins, and
// a missing file (CI) is not an error. Without it a reused local dev API
// (`reuseExistingServer`) wrote to the .env's DATABASE_URL while this process
// and its workers — `e2e/helpers/db-fixtures.ts`, and an API this config
// starts — fell back to the default database, so `password-reset.spec.ts`
// passed only with DATABASE_URL exported by hand.
try {
  process.loadEnvFile(resolve(__dirname, '../../.env'));
} catch {
  // no .env file present — expected outside local dev
}

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
// CR-189: E2E_WEB_PORT/E2E_API_PORT move the whole run off 3000/4000, so a
// developer's own dev servers there are never reused — or written to — by a
// test run (`reuseExistingServer` only matches the port it waits on). Unset,
// both keep the old ports: CI and a plain local run are unchanged.
const ISOLATED_PORTS = Boolean(
  process.env.E2E_WEB_PORT || process.env.E2E_API_PORT,
);
const WEB_URL = `http://localhost:${process.env.E2E_WEB_PORT ?? '3000'}`;
const API_URL = `http://localhost:${process.env.E2E_API_PORT ?? '4000'}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CR-138. `html` (never auto-opened) alongside the existing `list` console
  // output — needed so a failing screenshot's actual/expected/diff images
  // and traces are inspectable from CI's uploaded artifact, not just from a
  // local re-run.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  // CR-138. `maxDiffPixelRatio` tolerates sub-pixel anti-aliasing noise
  // without hiding a real layout/color regression; `animations: 'disabled'`
  // freezes CSS transitions/animations so a screenshot never lands mid
  // transition. Baselines must be generated on the same OS/browser build as
  // CI (`ubuntu-latest`, this pinned `@playwright/test` version) — see
  // `.claude/rules/testing.md` "Visual regression" for the Docker command,
  // never `--update-snapshots` run natively on a developer's machine.
  //
  // KI-073: `threshold` is the per-pixel colour tolerance (pixelmatch YIQ,
  // default 0.2). At 0.2 the dark theme's surfaces all compare equal — `bg` →
  // `bg-raised` is a delta of ~46 against 0.2's ~1409 — so removing every
  // card panel still passed. 0.02 (~14) tells `bg`/`bg-raised`/`surface`/
  // `border` apart; only `bg`/`cover-bg` (~6) stay equal.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.02,
      animations: 'disabled',
    },
  },
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../api',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: new URL(API_URL).port,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/coffee_ride',
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-local-secret',
        // The root .env's WEB_ORIGIN names :3000 — an isolated run's CSRF
        // Origin check must accept its own web port instead.
        WEB_ORIGIN: ISOLATED_PORTS
          ? WEB_URL
          : (process.env.WEB_ORIGIN ?? WEB_URL),
        // KI-014: critical-journeys.spec.ts alone makes 5 register + 5 login
        // calls per run — exactly the auth tier's 5/min cap, and its counters
        // can live in Redis across API restarts, so a second run within a
        // minute got 429. Test/dev-only override (apps/api's loadEnv()
        // rejects it in production). Only reaches an API this config starts:
        // with reuseExistingServer, an already-running local dev API keeps
        // its own env — set AUTH_RATE_LIMIT_MAX in the root .env for that
        // (see .env.example).
        AUTH_RATE_LIMIT_MAX: '1000',
        // CR-135: the global 100/min/IP tier too — every e2e actor shares
        // one localhost IP, and the expanded suite outgrew it.
        RATE_LIMIT_MAX: '10000',
      },
    },
    {
      command: `pnpm dev --port ${new URL(WEB_URL).port}`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        ...(ISOLATED_PORTS ? { API_INTERNAL_URL: API_URL } : {}),
      },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // CR-138. A second, mobile-viewport pass — scoped via `testMatch` to only
    // the specs that actually assert responsive/visual behavior at this
    // width, so every other spec still runs exactly once (desktop only)
    // instead of the whole suite silently doubling. `devices['Pixel 5']`
    // rather than an iPhone preset: CI's "Install Playwright browsers" step
    // installs Chromium only (`ci.yml`), and unlike the iPhone presets,
    // `Pixel 5` already defaults to the `chromium` engine — no second
    // browser download needed just for a mobile viewport.
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: ['mobile-cabinets.spec.ts', 'visual-regression.spec.ts'],
    },
  ],
});
