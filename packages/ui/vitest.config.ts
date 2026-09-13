import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Package-local config, not `config/vitest/node-library` (CR-064's original choice) —
// CR-065 added real components, and rendering/asserting on them needs jsdom + a React
// plugin, not the plain-Node `environment: 'node'` that fragment provides. Same shape
// as apps/web's own vitest.config.mts, which explicitly documents this same split.
// format.ts/terminology.ts's plain-logic tests are unaffected by the environment
// change — jsdom is a strict superset for code that never touches the DOM.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
