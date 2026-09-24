'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'types';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/api/current-user';

// CR-108. The global header and `CabinetShell` both need to know who is
// signed in, and before this each one would have fetched `/v1/auth/me`
// separately on every cabinet page load. The session is resolved once, here,
// and both read it — `CurrentUserContext` (`./current-user-context.tsx`) stays
// as the cabinet-scoped "the session is definitely resolved and non-null"
// guarantee that `useCurrentUser()` callers already rely on.

export type SessionStatus =
  | 'loading'
  | 'authenticated'
  /** Resolved, and nobody is signed in — a `401`, the ordinary case for a
   * public page, not an error. */
  | 'anonymous'
  /** The request itself failed (offline, API down). Distinct from `anonymous`:
   * the cabinet must not redirect to `/login` on a network blip. */
  | 'error';

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  /** Re-resolves the session. Used after sign-out so the header updates
   * without a full page load. */
  refresh: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [attempt, setAttempt] = useState(0);

  // `loading` at once, not after the re-fetch lands: `CabinetShell` acts on
  // `anonymous`, so a stale value would bounce a just-signed-in user to
  // `/login`.
  const refresh = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((response) => {
        if (cancelled) return;
        setUser(response.user);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setUser(null);
        setStatus(
          error instanceof ApiError && error.problem.status === 401
            ? 'anonymous'
            : 'error',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <SessionContext.Provider value={{ status, user, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession() must be called from inside SessionProvider.');
  }
  return session;
}
