'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Routes that draw their own header and page frame (CR-132). */
export function hasOwnChrome(pathname: string): boolean {
  return pathname === '/organizer' || pathname.startsWith('/organizer/');
}

/**
 * The site's shared chrome around every page: the global `AppHeader` plus
 * `docs/design.md` §11's 1200px content cap. CR-132 (ADR-024 mockup screen
 * 4): the organizer cabinet is an app frame of its own — its own header
 * (`OrganizerHeader`) and a full-height sidebar column — so on `/organizer/*`
 * this renders the page bare and `app/organizer/layout.tsx` draws the rest.
 * `header` arrives as an element from the root Server Component, which
 * still builds the flag-filtered registries it needs.
 */
export function SiteChrome({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (hasOwnChrome(pathname)) return <>{children}</>;

  return (
    <>
      {header}
      <div className="mx-auto w-full xl:max-w-300">{children}</div>
    </>
  );
}
