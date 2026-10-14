import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';
import { coverageConfig } from 'config/vitest/coverage';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

// Test files run in parallel (CR-267). Every DB-touching file wipes whole
// tables in `beforeEach` (`DELETE FROM users`, CR-011/CR-012), so two files
// sharing one database broke each other's requests (CR-013's intermittent
// 500s) and the suite ran with `fileParallelism: false` — ~5 min on CI. Now
// `worker-databases.ts` clones TEST_DATABASE_URL's database once per worker
// and `getTestDatabaseUrl()` points each worker at its own copy; files in one
// worker still run one after another, as before.
export default defineConfig({
  ...nodeLibraryVitestConfig(),
  test: {
    ...nodeLibraryVitestConfig().test,
    globalSetup: ['./src/test-support/worker-databases.ts'],
    setupFiles: ['./src/test-support/worker-redis.ts'],
    // Explicit, so worker-databases.ts knows how many copies to clone (Vitest's
    // own default: one core left for the main process); at most 15, one Redis
    // logical database each (worker-redis.ts).
    maxWorkers: Math.min(15, Math.max(1, availableParallelism() - 1)),
    // Integration tests (real Postgres, password hashing) next to other files
    // and `turbo test:coverage`'s other packages share the CPU now; the slowest
    // take ~1 s alone, Vitest's 5 s default was exceeded under a full parallel
    // run on a laptop.
    testTimeout: 15_000,
    // server.ts is the process entry point (listen + signal handlers); every
    // test builds the app through app.ts instead.
    coverage: coverageConfig({ exclude: ['src/server.ts'] }),
  },
});
