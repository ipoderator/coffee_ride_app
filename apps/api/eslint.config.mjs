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
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
