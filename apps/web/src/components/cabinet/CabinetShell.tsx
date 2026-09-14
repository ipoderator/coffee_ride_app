'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'types';
import { CABINET_TERMS, ErrorState, Skeleton } from 'ui';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/api/current-user';
import { CurrentUserContext } from '@/lib/auth/current-user-context';
import { PARTICIPANT_NAV_ITEMS } from '@/lib/cabinet/participant-nav';

type Status = 'loading' | 'ready' | 'error';

/**
 * Shared shell for every `/me/*` participant screen (`docs/design.md` §8:
 * "Both cabinets share a shell (nav + header) that renders from the feature
 * registry"). Resolves the session once, gates access on it (redirects to
 * `/login` on a 401 — never renders protected content first), and provides
 * the resolved user to nested pages via context so they don't each re-fetch
 * it (`@/lib/auth/current-user-context`).
 *
 * Nav renders from `PARTICIPANT_NAV_ITEMS` (ADR-009) — adding a feature means
 * adding its descriptor to that list, not a branch here.
 */
export function CabinetShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((response) => {
        if (cancelled) return;
        setUser(response.user);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.problem.status === 401) {
          router.replace('/login');
          return;
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label={CABINET_TERMS.loadingCurrentUser}
        className="mx-auto flex max-w-3xl flex-col gap-4 p-6"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error' || !user) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState message={CABINET_TERMS.loadCurrentUserError} />
      </div>
    );
  }

  return (
    <CurrentUserContext.Provider value={user}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
        <nav
          aria-label={CABINET_TERMS.navLabel}
          className="flex gap-4 border-b border-border pb-3"
        >
          {PARTICIPANT_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-text-secondary hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </CurrentUserContext.Provider>
  );
}
