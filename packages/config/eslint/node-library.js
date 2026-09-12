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

/**
 * @param {{ ignores?: string[] }} [options] extra glob patterns to ignore,
 *   on top of the always-ignored `dist/**` and `node_modules/**`.
 */
export function nodeLibraryConfig(options = {}) {
  const { ignores = [] } = options;

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
      },
    },
  );
}
