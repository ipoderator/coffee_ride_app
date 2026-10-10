import { defineConfig } from 'vitest/config';
import { coverageConfig } from 'config/vitest/coverage';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

export default defineConfig({
  test: {
    ...nodeLibraryVitestConfig().test,
    coverage: coverageConfig({
      // Scripts run by hand (migrate, seed, admin CLI) and the schema have no unit
      // tests; only the seed's testable steps, the migrations-folder resolver and the
      // admin CLI's messages are measured. `admin-grants.ts` is covered by apps/api's
      // admin suite against real Postgres.
      include: [
        'src/seed-demo-finish.ts',
        'src/migrations-folder.ts',
        'src/admin-cli-messages.ts',
      ],
    }),
  },
});
