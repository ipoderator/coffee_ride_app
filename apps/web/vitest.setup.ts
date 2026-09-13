import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `test.globals` is off (see vitest.config.ts's own `describe`/`it` imports),
// so `@testing-library/react`'s own auto-cleanup — which only self-registers
// against a *global* `afterEach` — never fires. Without this, every render in
// a multi-test file (CR-011's first: RegisterForm) leaks into the next test's
// DOM instead of unmounting between tests.
afterEach(() => {
  cleanup();
});
