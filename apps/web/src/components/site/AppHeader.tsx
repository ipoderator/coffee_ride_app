'use client';

import { LogIn, LogOut, Menu, Route, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  cn,
  NavMenu,
  NAV_BAR_ITEM_CLASSNAME,
  NAV_MENU_ITEM_CLASSNAME,
  SITE_HEADER_TERMS,
  Wordmark,
} from 'ui';
import { logout } from '@/lib/api/current-user';
import { useSession } from '@/lib/auth/session-context';
import { CABINET_ICONS } from '@/lib/cabinet/icons';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { ThemeToggle } from './ThemeToggle';

/**
 * The app's single navigation surface (CR-108), on every route — replacing
 * both the old three-link `SiteHeader` (only `/`, `/login`, `/register`) and
 * `CabinetShell`'s side column. Strava-style, per the reference the user
 * supplied: wordmark, the public section, one dropdown per cabinet, then the
 * theme control and the account menu.
 *
 * ADR-009 (`.claude/rules/extensibility.md`): both cabinet menus render from
 * the feature registries, so adding a cabinet feature still means adding a
 * descriptor — never a branch here. The registries arrive already
 * flag-filtered from the Server Component that renders this
 * (`app/layout.tsx`), because `filterEnabled` reads server-only env vars and
 * would silently disable everything if it ran in this `'use client'` module.
 */
export function AppHeader({
  participantNavItems,
  organizerNavItems,
}: {
  participantNavItems: CabinetNavItem[];
  organizerNavItems: CabinetNavItem[];
}) {
  const { status, user, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // A navigation is exactly when a still-open mobile panel is in the way.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      refresh();
      router.push('/');
    } finally {
      setLoggingOut(false);
    }
  }

  const isAuthenticated = status === 'authenticated';

  return (
    <header className="border-b border-border bg-bg">
      <nav
        aria-label={SITE_HEADER_TERMS.navLabel}
        className="mx-auto flex max-w-300 items-center gap-2 p-4"
      >
        <Link
          href="/"
          className="mr-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Wordmark />
        </Link>

        <HeaderLink
          href="/"
          label={SITE_HEADER_TERMS.homeLink}
          icon={<Route aria-hidden="true" />}
          active={pathname === '/'}
          className="hidden md:inline-flex"
        />

        {isAuthenticated && (
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <NavMenu
              label={SITE_HEADER_TERMS.participantMenuLabel}
              active={pathname.startsWith('/me')}
            >
              <MenuLink
                href="/me"
                label={SITE_HEADER_TERMS.participantOverviewLink}
                pathname={pathname}
              />
              {participantNavItems.map((item) => (
                <MenuLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  pathname={pathname}
                />
              ))}
            </NavMenu>

            <NavMenu
              label={SITE_HEADER_TERMS.organizerMenuLabel}
              active={pathname.startsWith('/organizer')}
            >
              <MenuLink
                href="/organizer"
                label={SITE_HEADER_TERMS.organizerOverviewLink}
                pathname={pathname}
              />
              {organizerNavItems.map((item) => (
                <MenuLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  pathname={pathname}
                />
              ))}
            </NavMenu>

            <ThemeToggle />

            <NavMenu label={user?.email ?? SITE_HEADER_TERMS.accountMenuLabel}>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className={cn(NAV_MENU_ITEM_CLASSNAME, 'disabled:opacity-60')}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {SITE_HEADER_TERMS.logoutLink}
              </button>
            </NavMenu>
          </div>
        )}

        {status === 'anonymous' && (
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <HeaderLink
              href="/login"
              label={SITE_HEADER_TERMS.loginLink}
              icon={<LogIn aria-hidden="true" />}
              active={pathname === '/login'}
            />
            <HeaderLink
              href="/register"
              label={SITE_HEADER_TERMS.registerLink}
              icon={<UserPlus aria-hidden="true" />}
              active={pathname === '/register'}
            />
            <ThemeToggle />
          </div>
        )}

        {/* `loading`/`error` render neither set: guessing wrong would flash
            "Войти" at someone who is already signed in, or the reverse. The
            theme control does not depend on the session, so it stays. */}
        {!isAuthenticated && status !== 'anonymous' && (
          <div className="ml-auto hidden md:flex">
            <ThemeToggle />
          </div>
        )}

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="app-header-mobile-menu"
          aria-label={
            mobileOpen
              ? SITE_HEADER_TERMS.closeMenuLabel
              : SITE_HEADER_TERMS.openMenuLabel
          }
          onClick={() => setMobileOpen((open) => !open)}
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md text-text-secondary hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* Below `md` the bar cannot hold every section at 375px
          (`docs/design.md` §11), so the same links live in one disclosure
          panel instead — a flat list, since a dropdown inside a dropdown is
          not worth the interaction cost on a phone. */}
      {mobileOpen && (
        <div
          id="app-header-mobile-menu"
          className="flex flex-col gap-1 border-t border-border p-4 md:hidden"
        >
          <MobileLink href="/" label={SITE_HEADER_TERMS.homeLink} />
          {isAuthenticated && (
            <>
              <MobileGroupLabel>
                {SITE_HEADER_TERMS.participantMenuLabel}
              </MobileGroupLabel>
              <MobileLink
                href="/me"
                label={SITE_HEADER_TERMS.participantOverviewLink}
              />
              {participantNavItems.map((item) => (
                <MobileLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                />
              ))}
              <MobileGroupLabel>
                {SITE_HEADER_TERMS.organizerMenuLabel}
              </MobileGroupLabel>
              <MobileLink
                href="/organizer"
                label={SITE_HEADER_TERMS.organizerOverviewLink}
              />
              {organizerNavItems.map((item) => (
                <MobileLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                />
              ))}
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={cn(NAV_MENU_ITEM_CLASSNAME, 'disabled:opacity-60')}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {SITE_HEADER_TERMS.logoutLink}
              </button>
            </>
          )}
          {status === 'anonymous' && (
            <>
              <MobileLink href="/login" label={SITE_HEADER_TERMS.loginLink} />
              <MobileLink
                href="/register"
                label={SITE_HEADER_TERMS.registerLink}
              />
            </>
          )}
          <div className="pt-2">
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}

function HeaderLink({
  href,
  label,
  icon,
  active,
  className,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        NAV_BAR_ITEM_CLASSNAME,
        active ? 'text-text' : 'text-text-secondary hover:text-text',
        className,
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function MenuLink({
  href,
  label,
  icon,
  pathname,
}: {
  href: string;
  label: string;
  icon?: CabinetNavItem['icon'];
  pathname: string;
}) {
  const Icon = icon ? CABINET_ICONS[icon] : null;
  const active = pathname === href;
  return (
    <Link
      href={href}
      role="menuitem"
      aria-current={active ? 'page' : undefined}
      className={cn(NAV_MENU_ITEM_CLASSNAME, active && 'bg-surface text-text')}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {label}
    </Link>
  );
}

function MobileLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: CabinetNavItem['icon'];
}) {
  const Icon = icon ? CABINET_ICONS[icon] : null;
  return (
    <Link href={href} className={NAV_MENU_ITEM_CLASSNAME}>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {label}
    </Link>
  );
}

function MobileGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 pt-3 text-xs font-medium tracking-wider text-text-muted uppercase">
      {children}
    </span>
  );
}
