// Shared Vitest coverage options (CR-136) for every package that runs
// Vitest — apps/api, apps/web, packages/ui, packages/maps-2gis,
// packages/resilience. Plain JS for the same reason as node-library.js.
//
// Coverage is off unless the run passes `--coverage` (each package's
// `test:coverage` script), so `pnpm test` stays as fast as before.
//
// No `thresholds` here: the gate is the root `coverage-baseline.json`,
// checked by `scripts/coverage-check.mjs` against the `json-summary` report
// written below. That script needs per-file numbers to score critical
// modules separately, and one baseline file is easier to review and ratchet
// than thresholds spread across five configs.

/**
 * @param {{ include?: string[], exclude?: string[] }} [options]
 * @returns {NonNullable<import('vitest/config').UserConfig['test']>['coverage']}
 */
export function coverageConfig({
  include = ['src/**/*.{ts,tsx}'],
  exclude = [],
} = {}) {
  return {
    provider: 'v8',
    // Listing `include` also reports source files no test ever loads, at 0%
    // — otherwise untested files would be invisible and inflate the total.
    include,
    exclude: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.d.ts',
      'src/test-support/**',
      ...exclude,
    ],
    reporter: ['text-summary', 'json-summary', 'html', 'lcov'],
    reportsDirectory: 'coverage',
  };
}
