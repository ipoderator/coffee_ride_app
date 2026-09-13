// packages/ui's formatters/terminology (CR-064) are plain TS logic, no DOM — same
// `node` environment as packages/maps-2gis's Vitest setup (`config/vitest/node-library`),
// not apps/web's jsdom + React config. If a future component test needs jsdom/RTL
// (CR-065/CR-066), that's a separate concern to add then, not to anticipate now.
import { defineConfig } from 'vitest/config';
import { nodeLibraryVitestConfig } from 'config/vitest/node-library';

export default defineConfig(nodeLibraryVitestConfig());
