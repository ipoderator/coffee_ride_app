import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { describeAdminCliResult } from './admin-cli-messages.js';
import { grantAdmin, listAdmins, revokeAdmin } from './admin-grants.js';
import * as schema from './schema/index.js';

// CR-228 (ADR-032): host-only admin management. Reads DATABASE_URL directly, like
// `migrate.ts` (packages/db never imports apps/api's env module).
//
//   pnpm --filter db admin:grant <email>
//   pnpm --filter db admin:revoke <email>
//   pnpm --filter db admin:list
//
// In production it runs in the `migrate` image, which carries this source:
//   docker compose --profile migrate run --rm migrate \
//     pnpm --filter db admin:grant <email>

const USAGE = 'Usage: admin-cli <grant|revoke> <email> | admin-cli list';

const [command, email] = process.argv.slice(2);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

try {
  if (command === 'list') {
    const admins = await listAdmins(db);
    for (const admin of admins) {
      console.log(`${admin.email}\t${admin.grantedAt.toISOString()}`);
    }
    if (admins.length === 0) console.log('No admins.');
  } else if ((command === 'grant' || command === 'revoke') && email) {
    const result =
      command === 'grant'
        ? await grantAdmin(db, email)
        : await revokeAdmin(db, email);
    const { message, exitCode } = describeAdminCliResult(result);
    if (exitCode === 0) console.log(message);
    else console.error(message);
    process.exitCode = exitCode;
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} finally {
  await client.end();
}
