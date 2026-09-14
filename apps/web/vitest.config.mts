import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// apps/web's own config, not the packages/config node-library fragment:
// component tests need jsdom + a React plugin, a different shape entirely
// from the plain-Node packages that fragment targets (CR-008).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors `tsconfig.json`'s `paths["@/*"]`. Next.js's own bundler
    // resolves that alias natively; Vite (what Vitest runs on) needs it
    // spelled out separately. `RegisterForm`'s page (CR-011) was the only
    // `@/...` import in the tree until CR-013 — never exercised by a Vitest
    // test file before now (only by Playwright against a real `next dev`
    // server), so the gap went unnoticed until `LoginForm`/`CabinetShell`/
    // `ProfileForm`'s tests needed it too.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
