import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Browsers decode an SVG image with a strict XML parser: one well-formedness
// error and the tab shows no icon at all. A `--` inside a comment (CR-130's
// "`--brand` values") broke it from 2026-09-24 until this test.
describe('app/icon.svg', () => {
  it('is well-formed XML', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'icon.svg'),
      'utf8',
    );
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');

    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.localName).toBe('svg');
  });
});
