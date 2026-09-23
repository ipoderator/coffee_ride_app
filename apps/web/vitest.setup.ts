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

// CR-110: jsdom does not implement `matchMedia` at all, so any component that
// reads `prefers-color-scheme` (the theme control, and the header that renders
// it) throws on mount rather than failing on anything real. A stub reporting
// "no preference" — the light theme, this app's default — is the environment
// gap being filled, not behavior under test; a test that cares about the dark
// branch overrides `matches` itself.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
