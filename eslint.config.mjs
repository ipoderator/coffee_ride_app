// Root ESLint flat config.
//
// This is the harness-level baseline for repo-root files (config, tooling) —
// `pnpm lint:root` and lint-staged's pre-commit `eslint --fix` both run with this
// directory as CWD, and flat config has no automatic directory cascading (one
// config wins per invocation, chosen by CWD — verified empirically), so this file
// is what actually lints anything passed to those two entry points.
//
// `apps/**`/`packages/**` are deliberately ignored here: each workspace member
// gets its own richer `eslint.config.mjs` (Next/React rules, etc.) run via
// `turbo lint`, which invokes each package's own "lint" script with CWD inside
// that package — that's where its local config is actually picked up. The
// practical gap this creates: lint-staged's pre-commit step does NOT run
// workspace-specific ESLint on staged `apps/*`/`packages/*` files (Prettier
// still does, via the broader glob below) — see KI-012. Real fix belongs to
// CR-010 ("Configure CI + Git hooks"), not to whichever task is currently
// adding a workspace member.
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
      'apps/**',
      'packages/**',
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
