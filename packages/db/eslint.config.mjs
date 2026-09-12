// packages/db ESLint config. Own copy, same reasoning as apps/api's
// eslint.config.mjs: root's config ignores apps/**/packages/** (CR-002), so
// `turbo lint` needs this file to check the package at all.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Unlike apps/api (which logs through pino), this package's only "app" is
      // the db:migrate CLI script, where console output is the actual UX.
      'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
    },
  },
);
