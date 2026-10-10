import type { GrantAdminResult, RevokeAdminResult } from './admin-grants.js';

// CR-232: what `admin-cli.ts` prints for each grant/revoke result and the exit code
// it ends with — split out so it is unit-tested without a database. A refusal
// (no such user, unconfirmed email) exits 1 so a deploy script notices it; a repeat
// grant/revoke changes nothing and is not an error.

type AdminCliResult = GrantAdminResult | RevokeAdminResult;

const OUTCOMES: Record<AdminCliResult, { message: string; exitCode: 0 | 1 }> = {
  granted: { message: 'Admin capability granted.', exitCode: 0 },
  already_admin: {
    message: 'This user is already an admin — nothing changed.',
    exitCode: 0,
  },
  revoked: { message: 'Admin capability revoked.', exitCode: 0 },
  not_admin: {
    message: 'This user is not an admin — nothing changed.',
    exitCode: 0,
  },
  user_not_found: { message: 'No user with this email.', exitCode: 1 },
  email_not_verified: {
    message:
      'This user has not confirmed their email — admin capability not granted. ' +
      'Confirm it via the verification email, then run admin:grant again.',
    exitCode: 1,
  },
};

export function describeAdminCliResult(result: AdminCliResult) {
  return OUTCOMES[result];
}
