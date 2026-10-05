// CR-210. Checks a production `.env` before `docker compose up`, without
// booting the API or touching any external service.
//
//   pnpm preflight                 check the repo-root .env
//   pnpm preflight --env <path>    check another env file
//
// Two tiers, matching the two failure shapes:
//
//   ERROR   — `loadEnv()` refused this configuration. The API would not boot:
//             a required value is missing, malformed, or still a local-dev
//             placeholder (`env.ts`'s PRODUCTION_PLACEHOLDER_CHECKS).
//   WARNING — the configuration boots, and the degraded mode it selects is
//             deliberately supported, but in production it leaves a
//             user-facing feature non-functional (`preflight.ts`).
//
// Exit code 1 on an ERROR only. Warnings are reported and exit 0: they are
// the operator's judgment call, not a broken configuration, and a launch
// checklist that fails on an accepted degraded mode trains people to ignore
// it.
//
// Checks configuration only — never that a service is actually reachable.
// NODE_ENV in the file under test is forced to `production`, so this reports
// what the production process would see even when run from a dev machine.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { loadEnv } from '../src/env.ts';
import { runPreflight } from '../src/preflight.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const envPath =
  envIndex === -1
    ? resolve(REPO_ROOT, '.env')
    : resolve(process.cwd(), args[envIndex + 1] ?? '');

// Parsed into a private object, never into this process's own `process.env`:
// the file under test is not this script's configuration, and merging it in
// would let an unrelated ambient variable silently satisfy a check.
let fileEnv: Record<string, string>;
try {
  fileEnv = parseEnv(readFileSync(envPath, 'utf8')) as Record<string, string>;
} catch (error) {
  console.error(
    `preflight: cannot read ${envPath}\n  ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

console.log(`Preflight: ${envPath} (as NODE_ENV=production)\n`);

let env;
try {
  env = loadEnv({ ...fileEnv, NODE_ENV: 'production' });
} catch (error) {
  // `loadEnv`'s message is already safe to print — field names and reasons
  // only, never the offending values (`.claude/rules/security.md`).
  console.error('ERROR — this configuration would not boot:\n');
  console.error(`${error instanceof Error ? error.message : String(error)}\n`);
  console.error('Fix the above, then run preflight again.');
  process.exit(1);
}

const findings = runPreflight(env);

if (findings.length === 0) {
  console.log('No warnings. Every optional feature is configured.');
  process.exit(0);
}

console.log(
  `${findings.length} warning${findings.length === 1 ? '' : 's'} — this configuration boots, but:\n`,
);

for (const finding of findings) {
  console.log(`  WARNING  ${finding.keys.join(', ')}`);
  console.log(`    what:   ${finding.problem}`);
  console.log(`    effect: ${finding.consequence}`);
  console.log(`    do:     ${finding.action}\n`);
}

console.log(
  'Warnings do not block a boot. Confirm each one is a deliberate choice\n' +
    'before serving real traffic — see deploy/FIRST-DEPLOY.md.',
);
