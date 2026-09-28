'use client';

import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  buttonClassName,
  cn,
  NavMenu,
  NAV_BAR_ITEM_CLASSNAME,
  NAV_MENU_ITEM_CLASSNAME,
  SITE_HEADER_TERMS,
  Wordmark,
} from 'ui';
import { useSession } from '@/lib/auth/session-context';
import { useLogout } from '@/lib/auth/use-logout';
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
  const { status, user } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    signOut: handleLogout,
    pending: loggingOut,
    failed: logoutFailed,
  } = useLogout('/');

  // A navigation is exactly when a still-open mobile panel is in the way.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isAuthenticated = status === 'authenticated';

  return (
    <header className="border-b border-border bg-bg-raised">
      {/* CR-154: the «Ночной старт» discovery mockup's header — a full-width
          raised bar (72px, 60px on a phone), pill section links beside the
          wordmark, the theme as an icon button, «Войти» as a ghost pill and
          «Регистрация» as the filled one. */}
      <nav
        aria-label={SITE_HEADER_TERMS.navLabel}
        className="flex h-15 items-center gap-1 pr-2 pl-4 md:h-18 md:gap-7 md:px-12"
      >
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Wordmark className="text-[1.375rem] md:text-[1.5rem]" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <HeaderLink
            href="/"
            label={SITE_HEADER_TERMS.homeLink}
            active={pathname === '/'}
          />
          {isAuthenticated ? (
            <>
              <NavMenu
                label={SITE_HEADER_TERMS.participantMenuLabel}
                active={pathname.startsWith('/me')}
                triggerClassName={pillClassName(pathname.startsWith('/me'))}
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
                triggerClassName={pillClassName(
                  pathname.startsWith('/organizer'),
                )}
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
            </>
          ) : (
            // Signed out (or not yet known): plain links to the same two
            // sections; each cabinet's own gate sends a visitor to `/login`.
            <>
              <HeaderLink
                href={PARTICIPANT_HREF}
                label={SITE_HEADER_TERMS.participantMenuLabel}
                active={pathname.startsWith('/me')}
              />
              <HeaderLink
                href="/organizer"
                label={SITE_HEADER_TERMS.organizerMenuLabel}
                active={pathname.startsWith('/organizer')}
              />
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1 md:gap-3">
          <ThemeToggle />

          {isAuthenticated && (
            <NavMenu
              label={user?.email ?? SITE_HEADER_TERMS.accountMenuLabel}
              className="hidden md:block"
              triggerClassName={pillClassName(false)}
            >
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
          )}

          {/* `loading`/`error` render neither set: guessing wrong would flash
              "Войти" at someone who is already signed in, or the reverse. */}
          {status === 'anonymous' && (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                href="/login"
                aria-current={pathname === '/login' ? 'page' : undefined}
                className={cn(
                  NAV_BAR_ITEM_CLASSNAME,
                  'rounded-full px-5 text-body-sm tracking-normal text-text-secondary hover:bg-surface hover:text-text',
                )}
              >
                {SITE_HEADER_TERMS.loginLink}
              </Link>
              <Link
                href="/register"
                aria-current={pathname === '/register' ? 'page' : undefined}
                className={buttonClassName('primary')}
              >
                {SITE_HEADER_TERMS.registerLink}
              </Link>
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
            className="inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
          >
            {mobileOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {logoutFailed && (
        <p role="alert" className="px-4 pb-3 text-body-sm text-danger md:px-12">
          {SITE_HEADER_TERMS.logoutError}
        </p>
      )}

      {/* Below `md` the bar cannot hold every section at 375px
          (`docs/design.md` §11), so the same links live in one disclosure
          panel instead — a flat list, since a dropdown inside a dropdown is
          not worth the interaction cost on a phone. The theme control stays
          in the bar (CR-154). */}
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
              <MobileLink
                href={PARTICIPANT_HREF}
                label={SITE_HEADER_TERMS.participantMenuLabel}
              />
              <MobileLink
                href="/organizer"
                label={SITE_HEADER_TERMS.organizerMenuLabel}
              />
              <MobileLink href="/login" label={SITE_HEADER_TERMS.loginLink} />
              <MobileLink
                href="/register"
                label={SITE_HEADER_TERMS.registerLink}
              />
            </>
          )}
        </div>
      )}
    </header>
  );
}

/** Signed out, «Мои заезды» points at the rides list itself. */
const PARTICIPANT_HREF = '/me/rides';

/** CR-154: the mockup's section pill — `surface` fill marks the current one. */
function pillClassName(active: boolean): string {
  return cn(
    'rounded-full px-4 font-medium tracking-normal',
    active ? 'bg-surface text-text' : 'text-text-secondary hover:text-text',
  );
}

function HeaderLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(NAV_BAR_ITEM_CLASSNAME, pillClassName(active))}
    >
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
    <span className="px-3 pt-3 font-mono text-label text-text-muted uppercase">
      {children}
    </span>
  );
}
