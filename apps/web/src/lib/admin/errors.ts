import { ADMIN_TERMS } from 'ui';
import { ApiError } from '@/lib/api/errors';

// CR-231: what a failed admin mutation tells the admin. Two conflicts have
// their own line; everything else is the generic one — the API's
// `problem.detail` is English and never rendered.
const MESSAGES_BY_CODE: Record<string, string> = {
  cannot_block_admin: ADMIN_TERMS.adminCannotBeBlocked,
  ride_not_cancellable: ADMIN_TERMS.rideNotCancellable,
};

export function adminActionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES_BY_CODE[error.problem.code] ?? ADMIN_TERMS.actionError;
  }
  return ADMIN_TERMS.actionError;
}
