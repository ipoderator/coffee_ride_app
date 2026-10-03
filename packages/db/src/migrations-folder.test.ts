import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from './migrations-folder.js';

// CR-196 (QA `fe0b4c2`): `pnpm --filter db db:migrate` from a checkout under a
// Cyrillic directory failed with `Can't find meta/_journal.json file`, because
// migrate.ts handed drizzle a percent-encoded `URL.pathname`. Every case below
// runs against a copy of packages/db under such a directory.
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const realMigrations = join(packageRoot, 'migrations');
const migrationCount = readMigrationFiles({
  migrationsFolder: realMigrations,
}).length;

let tempRoot: string;
let packageCopy: string;

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'cr196-'));
  packageCopy = join(tempRoot, 'КофеРайд', 'packages', 'db');
  cpSync(join(packageRoot, 'src'), join(packageCopy, 'src'), {
    recursive: true,
  });
  cpSync(realMigrations, join(packageCopy, 'migrations'), { recursive: true });
  cpSync(join(packageRoot, 'package.json'), join(packageCopy, 'package.json'));
  symlinkSync(
    join(packageRoot, 'node_modules'),
    join(packageCopy, 'node_modules'),
    'dir',
  );
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const migrateScriptUrl = () =>
  pathToFileURL(join(packageCopy, 'src', 'migrate.ts'));

describe('migrationsFolder', () => {
  it('resolves to the real directory from a non-ASCII checkout path', () => {
    const folder = migrationsFolder(migrateScriptUrl());

    expect(folder).toBe(join(packageCopy, 'migrations'));
    expect(readMigrationFiles({ migrationsFolder: folder })).toHaveLength(
      migrationCount,
    );
  });

  it('reproduces the original failure with URL.pathname', () => {
    const encoded = new URL('../migrations', migrateScriptUrl()).pathname;

    expect(encoded).toContain('%D0%9A');
    expect(() => readMigrationFiles({ migrationsFolder: encoded })).toThrow(
      "Can't find meta/_journal.json file",
    );
  });
});

// The real script, launched the way `pnpm --filter db db:migrate` does, from
// the non-ASCII copy. Needs a database; TEST_DATABASE_URL (as in apps/api,
// CR-096) so a developer's own DATABASE_URL is never touched. Re-applying
// already-applied migrations is a no-op under the advisory lock.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'migrate.ts from a non-ASCII path',
  () => {
    it('applies migrations instead of failing on meta/_journal.json', async () => {
      const tsx = join(packageCopy, 'node_modules', '.bin', 'tsx');
      const { stdout } = await promisify(execFile)(tsx, ['src/migrate.ts'], {
        cwd: packageCopy,
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      });

      expect(stdout).toContain('Migrations applied.');
    }, 60_000);
  },
);
