import { resolve } from 'node:path';
import { loadEnv } from './env.js';
import { runPreflight } from './preflight.js';
import { buildApp } from './app.js';
import { registerGracefulShutdown } from './lib/graceful-shutdown.js';

// Node 24 native .env loading (stable since Node 20.6, no `dotenv` dependency
// needed). One root .env for the whole monorepo (matches .env.example) —
// resolved explicitly since this process's CWD is apps/api, not the repo root.
// Same relative depth from src/ (tsx, dev) and dist/ (compiled, prod), both
// direct children of apps/api. Local dev only — production reads real
// environment variables from the platform, so a missing .env file is not an
// error.
try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
} catch {
  // no .env file present — expected outside local dev
}

const env = loadEnv();
const app = await buildApp(env);

// CR-210. `loadEnv()` above already refused to boot on missing/placeholder
// production values. This reports the other shape: configuration that boots
// fine and is a supported degraded mode, but that leaves a user-facing
// feature dead in production (an email key with no verified sender, no 2GIS
// key, no object storage). Logged here rather than in `buildApp` so the test
// suite's own deliberately-degraded instances stay quiet. Warnings only —
// never a boot failure.
for (const finding of runPreflight(env)) {
  app.log.warn(
    { keys: finding.keys, preflight: true },
    `Configuration warning: ${finding.problem} ${finding.consequence} ${finding.action}`,
  );
}

// CR-094/KI-048: without this, a real SIGTERM (docker stop/orchestrator
// shutdown) never runs app.close() — queue.ts's worker/producer disconnect
// and db.ts's pool close would simply never happen.
registerGracefulShutdown(app);

try {
  const address = await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`apps/api listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
