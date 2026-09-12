// packages/config lints itself with a plain JS config (no TypeScript here,
// so no typescript-eslint layer is needed — unlike the Node-library config
// this package hands out to everyone else).
import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
