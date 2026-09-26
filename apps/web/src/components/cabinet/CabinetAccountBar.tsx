'use client';

import { LogOut } from 'lucide-react';
import type { User } from 'types';
import { Button, CABINET_TERMS, SITE_HEADER_TERMS } from 'ui';
import { accountName } from '@/lib/auth/account-name';
import { useLogout } from '@/lib/auth/use-logout';

/**
 * CR-127: who is signed in plus a one-click «Выйти», on every cabinet screen
 * at every breakpoint — the header's copy of it sits behind a dropdown (and,
 * below `md`, a disclosure). Lands on `/login`: signing out of a cabinet is
 * usually switching accounts.
 */
export function CabinetAccountBar({ user }: { user: User }) {
  const { signOut, pending, failed } = useLogout('/login');
  const name = accountName(user);

  return (
    <section
      aria-label={CABINET_TERMS.accountBarLabel}
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-4"
    >
      <p className="min-w-0 text-sm text-text-secondary">
        {CABINET_TERMS.signedInAs}{' '}
        <span className="font-medium break-words text-text">
          {name ?? user.email}
        </span>
        {name && (
          <span className="break-all text-text-muted"> · {user.email}</span>
        )}
      </p>
      <Button variant="secondary" onClick={signOut} isLoading={pending}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {CABINET_TERMS.logoutButton}
      </Button>
      {failed && (
        <p role="alert" className="w-full text-sm text-danger">
          {SITE_HEADER_TERMS.logoutError}
        </p>
      )}
    </section>
  );
}
