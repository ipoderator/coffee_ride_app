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
// that package — that's where its local config is actually picked up.
// lint-staged's pre-commit step (root `package.json`) mirrors this exactly: it
// has one glob entry per workspace member, each running `pnpm --filter <name>
// exec eslint --fix` (which sets CWD to that package, resolving its own config
// correctly) instead of a single blanket rule that would only ever hit this
// root file — see KI-012 (CR-010, resolved) for why a single rule couldn't
// work here.
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
      // CR-139: k6 scripts (load/k6/**) import from 'k6/*' module specifiers
      // and run under k6's own JS runtime, not Node — no ESLint config here
      // resolves or type-checks either of those, same reasoning as the two
      // ignores above.
      'load/**',
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
  {
    // Skill helper scripts (`.claude/skills/*/`, e.g. mockup-to-screen's
    // `shots.mjs`): plain Node scripts whose `page.evaluate` callbacks run in
    // the browser, and whose whole output is a console report.
    files: ['.claude/skills/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        innerWidth: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Operator-facing CLI scripts (`scripts/`, e.g. `coverage-check.mjs`,
    // `apps/api/scripts/preflight.ts`): the console report *is* the output,
    // not a leftover debug statement — same reasoning as the skill scripts
    // above. Deliberately not extended to `src/**`, where a log line belongs
    // in the structured logger (CR-210).
    files: ['scripts/**/*.{mjs,ts}', 'apps/*/scripts/**/*.{mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
);
