// packages/ui ESLint config. Own copy, not packages/config's node-library
// helper: this is a browser/React package, not a Node one (no `no-console`
// server-log allowance is meaningful here the same way, and a React-specific
// ruleset — e.g. eslint-plugin-react-hooks — belongs here once real
// components land in CR-063, not in the generic Node-library factory).
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
    },
  },
);
