import { defineConfig, devices } from '@playwright/test';

// e2e smoke config (CR-008). Root package.json's "test:e2e" already
// delegates here via `turbo test:e2e`. NOT wired into CI yet — KI-007
// already names that CR-080's job (no migration/MinIO service in
// .github/workflows/ci.yml either); this runs locally against `next dev`
// for now, per `.claude/rules/testing.md`'s critical-journey list, starting
// with the one journey that exists today (the bootstrap placeholder loads).
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
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
