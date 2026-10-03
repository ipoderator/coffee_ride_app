import { defineConfig } from 'vitest/config';
import { coverageConfig } from 'config/vitest/coverage';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

export default defineConfig({
  test: {
    ...nodeLibraryVitestConfig().test,
    coverage: coverageConfig({
      // Scripts run by hand (migrate, seed) and the schema have no unit tests;
      // only the seed's testable steps and the migrations-folder resolver are
      // measured.
      include: ['src/seed-demo-finish.ts', 'src/migrations-folder.ts'],
    }),
  },
});
