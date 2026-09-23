// apps/api ESLint config.
//
// Own copy, not an import of the root config: root's eslint.config.mjs
// deliberately ignores apps/**/packages/** (see its own comment, CR-002) since
// flat config resolves one file per invocation by process CWD — `turbo lint`
// runs this package's own "lint" script with CWD here, so this file is what
// actually applies. No framework-specific plugin needed yet (plain Node/TS);
// revisit if `packages/config` (CR-007) centralizes this instead.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `js.configs.recommended`'s `no-undef` doesn't know Node's ambient
    // globals for a plain `.mjs` file the way TS files' own type-checker
    // does (typescript-eslint's recommended config disables `no-undef`
    // there instead) — `scripts/build.mjs` (ADR-017) is the first non-TS
    // source file here, so it needs its actual globals declared explicitly
    // rather than pulling in a whole `globals` package for one identifier.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { URL: 'readonly' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // CR-056 (ADR-010, `.claude/rules/maps.md`): only packages/maps-2gis
      // may import a 2GIS SDK package. No such package is installed
      // anywhere yet — preventative, same shape as packages/resilience
      // (CR-049).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*2gis*'],
              message:
                'Only packages/maps-2gis may import a 2GIS SDK package (ADR-010, .claude/rules/maps.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // CR-114: `plugins/maps.ts` is apps/api's one composition point
    // (`.claude/rules/architecture.md`) — the only file here allowed to import
    // `maps-2gis` (whose name the `*2gis*` glob also matches) to wire the
    // concrete adapter behind `maps-core`'s `MapProvider`. Same shape as
    // apps/web's `create-map-renderer.ts` override.
    files: ['src/plugins/maps.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
