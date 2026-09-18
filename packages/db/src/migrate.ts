import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Standalone CLI script — reads DATABASE_URL directly rather than importing
// apps/api's env module (that would invert the dependency direction fixed by
// .claude/rules/architecture.md: api -> db, never db -> api). Used both for
// local `pnpm db:migrate` and CR-076's deploy-time migration step
// (migrations run as an explicit step, never on application boot — see
// docker-compose.prod.yml's `migrate` service).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const client = postgres(connectionString, { max: 1 });

// CR-076/KI-002: drizzle's own migrator (drizzle-orm/postgres-js/migrator)
// reads the last-applied migration and applies missing ones inside one
// transaction, but does not itself serialize concurrent invocations — two
// deploys racing, or several `api` instances each independently trying to
// migrate, could both see "nothing applied yet" and race to create the same
// schema/tables. Confirmed this is a real race, not a hypothetical one: two
// concurrent `pnpm db:migrate` runs against a fresh database reliably produce
// exactly this — one fails with `duplicate key value violates unique
// constraint "pg_namespace_nspname_index"` on `CREATE SCHEMA IF NOT EXISTS
// "drizzle"`.
//
// A session-level Postgres advisory lock makes concurrent runs safe: the
// second process blocks on `pg_advisory_lock` until the first releases it,
// then finds nothing left to apply and exits as a clean no-op instead of
// racing. This requires the lock and the migration to run on the same
// physical connection/session — guaranteed here by `{ max: 1 }` (one
// physical connection for this client's whole lifetime) and by never issuing
// a second query before the previous one resolves. (A `client.reserve()`
// connection was tried first for an explicit guarantee instead of relying on
// `max: 1`, but drizzle's postgres-js driver reaches into `client.options`
// to register type parsers — a reserved connection doesn't expose that,
// so `drizzle(reserved)` throws at construction time.)
const MIGRATION_LOCK_KEY = 8_812_046; // arbitrary, fixed — must never change
try {
  await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  await migrate(drizzle(client), {
    migrationsFolder: new URL('../migrations', import.meta.url).pathname,
  });
} finally {
  await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
}

await client.end();

console.log('Migrations applied.');
