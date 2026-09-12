import { defineConfig } from 'drizzle-kit';

// drizzle-kit CLI config. `generate` produces a real, committed SQL migration
// file per schema change (.claude/rules/database.md: "every schema change
// requires a migration") — never `drizzle-kit push`, which would sync the
// schema directly and skip that trail.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
