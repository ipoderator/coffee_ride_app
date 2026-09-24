'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { logout } from '@/lib/api/current-user';
import { useSession } from './session-context';

export interface LogoutState {
  signOut: () => Promise<void>;
  pending: boolean;
  failed: boolean;
}

export function useLogout(redirectTo: string): LogoutState {
  const { refresh } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    setFailed(false);
    try {
      await logout();
    } catch (error) {
      // A 401 means the session is already gone — the goal is reached.
      if (!(error instanceof ApiError && error.problem.status === 401)) {
        setFailed(true);
        setPending(false);
        return;
      }
    }
    refresh();
    router.push(redirectTo);
    setPending(false);
  }, [redirectTo, refresh, router]);

  return { signOut, pending, failed };
}
