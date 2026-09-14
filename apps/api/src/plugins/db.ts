import type { FastifyInstance } from 'fastify';
import { createDbClient, type DbClient } from 'db';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
  }
}

// Mirrors `redis.ts`/`s3.ts`'s factory shape (CR-005/CR-006): decorates the
// instance with a client built from validated env. First real DB consumer
// (CR-011) — `packages/db`'s `createDbClient` connects lazily (no query on
// construction), so this never blocks boot on the database being reachable; a
// query-time failure surfaces through the normal error handler, not here.
//
// `onClose` ends the underlying postgres.js connection pool (`db.$client`,
// per drizzle-orm's postgres-js driver) when the Fastify instance closes.
// Found and fixed this session (CR-013): nothing previously closed this pool,
// so every `buildApp()` in a test file leaked its connections for the life of
// the process — invisible with one or two test files, but real Postgres
// exhaustion (`max_connections`) once a fourth test file (`users.routes.
// test.ts`) added enough concurrent `buildApp()` calls, surfacing as
// intermittent 500s on unrelated requests. Same class of latent bug as the
// CR-012 TRUNCATE deadlock: invisible until enough concurrent load exposed it.
export function registerDb(app: FastifyInstance, env: Env) {
  const db = createDbClient(env.DATABASE_URL);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db.$client.end();
  });
}
