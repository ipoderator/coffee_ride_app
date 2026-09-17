// Shared ESLint flat-config factory for plain Node/TypeScript library
// packages (packages/types, packages/maps-core, packages/maps-2gis, and any
// future Node-only package).
//
// Every workspace member still needs its own `eslint.config.mjs` file: flat
// config has no automatic directory cascading, and `turbo lint` runs each
// package's own "lint" script with that package as CWD (see apps/api's and
// packages/db's own eslint.config.mjs comments, KI-012). What this module
// removes is the copy-pasted *content* of that file — before this package
// existed, packages/db and apps/api each hand-wrote the same
// recommended-configs-plus-house-rules block. New Node packages call
// `nodeLibraryConfig()` instead of repeating it.
//
// apps/web and apps/api are NOT migrated to this by CR-007: they predate
// packages/config and are not currently broken, so retrofitting them is left
// as optional future cleanup rather than mixed into this task
// (`.claude/rules/git.md` — don't mix unrelated refactors with feature work).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// CR-056 (ADR-010, `.claude/rules/maps.md`): "packages/maps-2gis is the only
// package allowed to import the 2GIS SDK." No such SDK is actually installed
// anywhere yet (`packages/maps-2gis` calls 2GIS's REST APIs via plain
// `fetch`) — this is preventative, the same "shared infra ahead of a
// specific need" shape as `packages/resilience` (CR-049), guarding the day a
// real vendor package (e.g. `@2gis/mapgl`, for browser rendering, KI-031)
// gets installed. `*2gis*` is a glob, not a fixed name: it catches any
// npm-name shape a 2GIS package plausibly takes.
const NO_2GIS_SDK_IMPORTS = {
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
};

/**
 * @param {{ ignores?: string[], allowMapsSdkImports?: boolean }} [options]
 *   `ignores`: extra glob patterns to ignore, on top of the always-ignored
 *   `dist/**` and `node_modules/**`. `allowMapsSdkImports`: set by
 *   `packages/maps-2gis` itself — the one caller exempt from
 *   `NO_2GIS_SDK_IMPORTS` above.
 */
export function nodeLibraryConfig(options = {}) {
  const { ignores = [], allowMapsSdkImports = false } = options;

  return tseslint.config(
    {
      ignores: ['dist/**', 'node_modules/**', ...ignores],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        ...(allowMapsSdkImports ? {} : NO_2GIS_SDK_IMPORTS),
      },
    },
  );
}
