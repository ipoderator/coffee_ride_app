'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'types';
import { CABINET_TERMS, ErrorState, Skeleton } from 'ui';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/api/current-user';
import { CurrentUserContext } from '@/lib/auth/current-user-context';
import type { CabinetNavItem } from '@/lib/cabinet/types';

type Status = 'loading' | 'ready' | 'error';

/**
 * Shared shell for every `/me/*` and `/organizer/*` screen (`docs/design.md` §8:
 * "Both cabinets share a shell (nav + header) that renders from the feature
 * registry" — CR-014 generalized this from a participant-only component to take
 * `navItems`, since the design doc already says it's meant to be the same shell,
 * not a parallel copy per cabinet, `.claude/rules/extensibility.md`). Resolves the
 * session once, gates access on it (redirects to `/login` on a 401 — never renders
 * protected content first), and provides the resolved user to nested pages via
 * context so they don't each re-fetch it (`@/lib/auth/current-user-context`).
 *
 * Both cabinets require the same participant-tier session — organizer capability
 * is a separate, per-action server-side check (`.claude/rules/security.md`), not a
 * different login, so the redirect target stays `/login` for both.
 *
 * Nav renders from the caller-supplied `navItems` (ADR-009) — adding a feature to
 * either cabinet means adding its descriptor to that cabinet's registry list, not a
 * branch here.
 */
export function CabinetShell({
  navItems,
  children,
}: {
  navItems: CabinetNavItem[];
  children: ReactNode;
}) {
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
          {navItems.map((item) => (
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
