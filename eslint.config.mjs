// Root ESLint flat config.
//
// This is the harness-level baseline so `pnpm lint:root` / lint-staged / CI have
// something to run before CR-007 ("Configure shared packages") introduces
// `packages/config` with the real shared ESLint config that `apps/*` and
// `packages/*` will extend individually via `turbo lint`.
//
// Do not silently replace this file's intent (flag real problems, don't block on
// style — Prettier owns style) without recording the change in docs/decisions.md.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
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
