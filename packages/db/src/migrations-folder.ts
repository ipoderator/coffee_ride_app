import { fileURLToPath } from 'node:url';

// CR-196: the filesystem path of `packages/db/migrations`, resolved from the
// URL of a module in `packages/db/src` (`import.meta.url`). Must go through
// `fileURLToPath`, never `URL.pathname`: `pathname` keeps non-ASCII characters
// percent-encoded, so a checkout under e.g. `.../КофеРайд/...` handed drizzle's
// migrator a path that doesn't exist (`Can't find meta/_journal.json file`).
export function migrationsFolder(moduleUrl: string | URL): string {
  return fileURLToPath(new URL('../migrations', moduleUrl));
}
