import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Creates a Drizzle client bound to the given connection string. A factory,
 * not a global singleton reading `process.env` itself: `packages/db` is a
 * library (`.claude/rules/architecture.md`) — the caller (`apps/api`) owns env
 * validation and passes in an already-validated `DATABASE_URL`.
 */
export function createDbClient(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
