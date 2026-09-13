import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library's own auto-cleanup only registers itself when `afterEach` exists as
// a *global* (`test.globals: true`), which this config deliberately doesn't set — so
// without this, jsdom's `document` accumulates every `render()` across a whole test
// file (and multiple renders within one `it`, e.g. a table-driven test), and later
// assertions start failing with "found multiple elements" for reasons that have
// nothing to do with the component under test. Explicit is better here than turning on
// globals just for this.
afterEach(() => {
  cleanup();
});
