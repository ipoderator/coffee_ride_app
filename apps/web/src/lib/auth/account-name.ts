import type { User } from 'types';

/**
 * The name a signed-in account is shown under — real first/last name
 * (CR-125), else the display name, else `null` (callers fall back to the
 * email). Shared by CR-127's account bar and CR-132's organizer header.
 */
export function accountName(user: User): string | null {
  const fullName = [user.firstName, user.lastName]
    .filter((part) => part && part.trim())
    .join(' ');
  return fullName || user.displayName?.trim() || null;
}
