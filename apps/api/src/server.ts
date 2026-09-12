import { resolve } from 'node:path';
import { loadEnv } from './env.js';
import { buildApp } from './app.js';

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

try {
  const address = await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`apps/api listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
