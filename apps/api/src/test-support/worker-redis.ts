// CR-267: Vitest setupFile — runs in each worker before every test file.
// Test files in different workers run at the same time, and the live-Redis
// suites (auth/avatar rate limits, the notification queue) keep counters keyed
// by the same synthetic `.inject()` IP — one worker's requests used up another
// worker's limit. Each worker gets its own Redis logical database
// (`/<VITEST_POOL_ID>`; Redis has 0..15, so vitest.config.ts caps the workers
// at 15). Same idea as the per-worker Postgres copy in test-database-url.ts.
// Nothing is imported here: queue.test.ts mocks `ioredis`, and a module loaded
// by a setupFile is already cached by the time a test file's `vi.mock` runs.
const url = process.env.REDIS_URL;
const poolId = process.env.VITEST_POOL_ID;
if (url && poolId) {
  const workerUrl = new URL(url);
  workerUrl.pathname = `/${poolId}`;
  process.env.REDIS_URL = workerUrl.toString();
}
