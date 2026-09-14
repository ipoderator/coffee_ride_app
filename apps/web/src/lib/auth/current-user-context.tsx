'use client';

import { createContext, useContext } from 'react';
import type { User } from 'types';

// Populated by `CabinetShell` once it has resolved the session (it never
// renders `children` until then, and it redirects to `/login` on a 401
// instead) — so any component under the shell can assume a non-null value.
export const CurrentUserContext = createContext<User | null>(null);

export function useCurrentUser(): User {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error(
      'useCurrentUser() must be called from inside CabinetShell, which guarantees the session is resolved.',
    );
  }
  return user;
}
