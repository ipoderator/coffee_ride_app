import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';

// Route group (no URL segment): `/`, `/register`, `/login` (CR-099). Adds
// the shared `SiteHeader` these three screens were missing — see that
// component's doc comment. Deliberately scoped to just these three routes,
// not `/organizer/*`/`/me/*` (those already have `CabinetShell`'s own nav)
// or `/rides/[id]` (not part of the reported gap).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
