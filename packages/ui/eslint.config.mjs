// packages/ui ESLint config. Own copy, not packages/config's node-library
// helper: this is a browser/React package, not a Node one (no `no-console`
// server-log allowance is meaningful here the same way). No React-hooks/JSX-a11y
// plugin yet (CR-065): none of the components added so far use hooks — plain,
// stateless presentational markup — so that dependency stays deferred until a
// component that actually needs it (e.g. a future interactive primitive) lands,
// same "tooling when there's a real need" discipline used elsewhere in this repo.
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
      // docs/design.md §14 (CR-063's rule, mirrored here CR-065): components are
      // exactly where a raw hex value would otherwise sneak in first — enforce the
      // same restriction apps/web's config carries, not just at the consumer end.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message:
            'Raw hex colors are not allowed here — use a design token from tokens.css (docs/design.md §3).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message:
            'Raw hex colors are not allowed here — use a design token from tokens.css (docs/design.md §3).',
        },
      ],
      // CR-056 (ADR-010, `.claude/rules/maps.md`): only packages/maps-2gis
      // may import a 2GIS SDK package. No such package is installed
      // anywhere yet — preventative, same shape as packages/resilience
      // (CR-049).
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
);
