import { defineConfig } from 'vitest/config';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

// `fileParallelism: false` (apps/api only — `packages/maps-2gis` stays on the
// shared fragment's default, it mocks `fetch` and touches no shared external
// resource): every test file here shares one real Postgres database and each
// file's `beforeEach` does an unscoped `DELETE FROM users` (CR-011/CR-012's
// TRUNCATE-deadlock fix). That's safe within one file (tests run in
// sequence), but Vitest's default is to run different *files* concurrently —
// found this session (CR-013), adding a fourth DB-touching file
// (`users.routes.test.ts`) made two files' concurrent `DELETE FROM users`
// calls collide with each other's in-flight register/login/patch requests,
// often enough to surface as intermittent `500`s (a genuine Postgres
// deadlock/serialization failure, not a bug in either file). Serializing
// files removes the race at its root instead of trying to scope every test's
// data by file (which the existing "wipe the whole table" pattern isn't
// designed for). The suite is small enough (currently 4 files) that this
// costs no meaningful wall-clock time.
export default defineConfig({
  ...nodeLibraryVitestConfig(),
  test: {
    ...nodeLibraryVitestConfig().test,
    fileParallelism: false,
  },
});
