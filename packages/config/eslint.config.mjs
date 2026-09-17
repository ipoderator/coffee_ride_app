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
      // CR-056 (ADR-010, `.claude/rules/maps.md`): only packages/maps-2gis
      // may import a 2GIS SDK package. This package is tooling-only and
      // will never legitimately need one, but the rule stays consistent
      // with every other workspace member rather than carving out a silent
      // exception.
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
];
