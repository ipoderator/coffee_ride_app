// Server-safe entry point (CR-114): everything except the browser-only
// render layer, whose types reference DOM globals (`HTMLElement`) that a
// Node-only tsconfig doesn't have. `apps/api` imports from here, never from
// the package root (`.claude/rules/maps.md`: server code never imports
// `render.ts`).
export * from './config.js';
export * from './errors.js';
export * from './provider.js';
