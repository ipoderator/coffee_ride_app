// CR-267: Vitest globalSetup. Runs once per `vitest run`, before any test file:
// (re)creates one database per worker as a copy of TEST_DATABASE_URL's
// migrated database (`CREATE DATABASE … TEMPLATE`), so each worker starts
// from the current schema and test files no longer have to run one at a time
// (see test-database-url.ts). Copies are dropped and re-cloned every run, so a
// new migration applied to the base database reaches them.
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

import {
  getBaseTestDatabaseUrl,
  workerDatabaseName,
} from './test-database-url.js';

export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = new URL(getBaseTestDatabaseUrl());
  const baseName = baseUrl.pathname.slice(1);
  // CREATE/DROP DATABASE can't run inside the database being copied.
  const maintenanceUrl = new URL(baseUrl);
  maintenanceUrl.pathname = '/postgres';

  const sql = postgres(maintenanceUrl.toString(), {
    max: 1,
    onnotice: () => {},
  });
  try {
    for (let poolId = 1; poolId <= project.config.maxWorkers; poolId++) {
      const name = sql(workerDatabaseName(baseName, poolId));
      await sql`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`;
      // Fails while another session is connected to the template — e.g. a
      // `pnpm dev` API pointed at the same database.
      await sql`CREATE DATABASE ${name} TEMPLATE ${sql(baseName)}`;
    }
  } finally {
    await sql.end();
  }
}
