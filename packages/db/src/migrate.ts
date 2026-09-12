import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Standalone CLI script — reads DATABASE_URL directly rather than importing
// apps/api's env module (that would invert the dependency direction fixed by
// .claude/rules/architecture.md: api -> db, never db -> api). Used both for
// local `pnpm db:migrate` and, later, CR-076's deploy-time migration step
// (migrations run as an explicit step, never on application boot).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, {
  migrationsFolder: new URL('../migrations', import.meta.url).pathname,
});
await migrationClient.end();

console.log('Migrations applied.');
