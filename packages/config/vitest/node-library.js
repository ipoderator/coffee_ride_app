// Shared Vitest config fragment for plain Node/TypeScript library and
// service packages (apps/api, packages/maps-2gis, and any future Node-only
// package — CR-008). Plain JS, not `defineConfig(...)` + TypeScript — same
// reasoning as eslint/node-library.js: keeps packages/config free of its own
// `vitest`/`vite` install just to type one object literal. Each consumer's
// own vitest.config.ts already gets full type-checking from its own
// installed `vitest`; this fragment only needs to be a plain object shaped
// like `UserConfig`.
//
// apps/web is NOT built on this fragment: it needs jsdom + a React plugin
// for component tests, a different shape entirely — see its own
// vitest.config.ts.

/**
 * @returns {import('vitest/config').UserConfig}
 */
export function nodeLibraryVitestConfig() {
  return {
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      restoreMocks: true,
    },
  };
}
