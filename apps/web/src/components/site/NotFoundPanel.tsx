'use client';

import Link from 'next/link';
import { buttonClassName, NOT_FOUND_TERMS } from 'ui';

/**
 * QA live audit 2026-10-08, items 4–5: the one «not found» face — the app's
 * 404 page, a missing ride's 404 and `RideDetailView`'s own not-found state.
 * The title is the page's `h1` (`docs/design.md` §12: one per page); the way
 * out goes back to the catalog, where every public ride is.
 */
export function NotFoundPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="font-mono text-label text-text-muted uppercase">404</p>
      <h1 className="text-h1 text-text">{title}</h1>
      <p className="max-w-md text-body text-text-secondary">{description}</p>
      <Link href="/" className={buttonClassName('primary', 'mt-2')}>
        {NOT_FOUND_TERMS.toDiscovery}
      </Link>
    </section>
  );
}
