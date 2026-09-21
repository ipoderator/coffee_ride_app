import { Home, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { SITE_HEADER_TERMS } from 'ui';

/**
 * Shared header for the public, pre-cabinet screens (`/`, `/register`,
 * `/login` — `app/(public)/layout.tsx`). QA finding (CR-099): none of these
 * three screens linked to each other or into a cabinet, so a visitor had no
 * way to move between them without typing a URL. Static by design — see
 * `SITE_HEADER_TERMS`'s doc comment for why this doesn't check the session.
 *
 * A plain Server Component: no client state, so no reason to ship it as one
 * (`.claude/rules/frontend.md`).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <nav
        aria-label={SITE_HEADER_TERMS.navLabel}
        className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4"
      >
        <Link href="/" className="text-lg font-semibold text-text">
          {SITE_HEADER_TERMS.brand}
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-text-secondary hover:text-text"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {SITE_HEADER_TERMS.homeLink}
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-text-secondary hover:text-text"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {SITE_HEADER_TERMS.loginLink}
          </Link>
          <Link
            href="/register"
            className="flex items-center gap-1.5 text-text-secondary hover:text-text"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {SITE_HEADER_TERMS.registerLink}
          </Link>
          <Link
            href="/me"
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            {SITE_HEADER_TERMS.cabinetLink}
          </Link>
        </div>
      </nav>
    </header>
  );
}
