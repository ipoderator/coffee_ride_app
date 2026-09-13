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
export function registerDb(app: FastifyInstance, env: Env) {
  app.decorate('db', createDbClient(env.DATABASE_URL));
}
