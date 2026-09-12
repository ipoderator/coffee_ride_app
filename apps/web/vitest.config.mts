import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// apps/web's own config, not the packages/config node-library fragment:
// component tests need jsdom + a React plugin, a different shape entirely
// from the plain-Node packages that fragment targets (CR-008).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
