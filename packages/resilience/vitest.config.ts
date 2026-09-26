import { defineConfig } from 'vitest/config';
import { coverageConfig } from 'config/vitest/coverage';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

export default defineConfig({
  test: {
    ...nodeLibraryVitestConfig().test,
    coverage: coverageConfig(),
  },
});
