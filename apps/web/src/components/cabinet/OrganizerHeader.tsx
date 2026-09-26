'use client';

import { House, LogOut, Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import {
  Avatar,
  buttonClassName,
  cn,
  NavMenu,
  NAV_MENU_ITEM_CLASSNAME,
  ORGANIZER_HEADER_TERMS,
  Wordmark,
} from 'ui';
import {
  ThemeMenuItems,
  useThemePreference,
} from '@/components/site/ThemeToggle';
import { accountName } from '@/lib/auth/account-name';
import { useSession } from '@/lib/auth/session-context';
import { useLogout } from '@/lib/auth/use-logout';

/**
 * CR-132 (ADR-024 mockup screen 4): the organizer cabinet's own header —
 * wordmark, «+ Создать заезд», and an avatar that opens the account menu
 * (who is signed in, the way back to discovery and to the participant
 * cabinet, the theme, «Выйти»). Replaces the shared `AppHeader` on
 * `/organizer/*` (`SiteChrome`) and, with it, CR-127's account bar there:
 * identity and sign-out now live in this menu. The cabinet's sections are
 * the sidebar's job (`CabinetSidebar`/`CabinetSectionTabs`), not this bar's.
 *
 * Height is fixed at 4.25rem (py-3 around the 44px controls) —
 * `CabinetShell`'s frame row sizes itself against it.
 */
export function OrganizerHeader() {
  const { status, user } = useSession();
  const [theme, chooseTheme] = useThemePreference();
  const { signOut, pending, failed } = useLogout('/login');
  const name = user ? accountName(user) : null;

  return (
    <header className="border-b border-border bg-bg">
      <nav
        aria-label={ORGANIZER_HEADER_TERMS.navLabel}
        className="flex h-17 items-center gap-3 px-4 md:px-6"
      >
        <Link
          href="/"
          className="mr-auto rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Wordmark />
        </Link>

        <Link
          href="/organizer/rides/new"
          className={buttonClassName(
            'primary',
            'min-h-11 px-3 font-semibold sm:px-5 md:min-h-11',
          )}
        >
          <Plus className="size-5" aria-hidden="true" />
          {/* Icon-only on a phone, where the wordmark and the avatar leave no
              room for the words; the name stays for assistive tech. */}
          <span className="sr-only sm:not-sr-only">
            {ORGANIZER_HEADER_TERMS.createRide}
          </span>
        </Link>

        {status === 'authenticated' && user && (
          <NavMenu
            label={ORGANIZER_HEADER_TERMS.accountMenuLabel}
            labelHidden
            hideChevron
            triggerClassName="min-w-11 justify-center rounded-full px-0"
            icon={
              // Decorative inside the trigger: the button's name is the
              // menu's, and the menu's first line names the account.
              <span aria-hidden="true">
                <Avatar
                  name={name ?? user.email}
                  size="sm"
                  className="size-11 bg-surface text-sm font-semibold text-text"
                />
              </span>
            }
          >
            <div role="none" className="px-3 pt-2 pb-2.5">
              {name && (
                <p className="truncate text-sm font-semibold text-text">
                  {name}
                </p>
              )}
              <p className="truncate text-xs text-text-secondary">
                {user.email}
              </p>
            </div>
            <div role="separator" className="my-0.5 h-px bg-border" />
            <Link href="/" role="menuitem" className={NAV_MENU_ITEM_CLASSNAME}>
              <House className="size-4" aria-hidden="true" />
              {ORGANIZER_HEADER_TERMS.allRidesLink}
            </Link>
            <Link
              href="/me"
              role="menuitem"
              className={NAV_MENU_ITEM_CLASSNAME}
            >
              <UserRound className="size-4" aria-hidden="true" />
              {ORGANIZER_HEADER_TERMS.participantCabinetLink}
            </Link>
            <div role="separator" className="my-0.5 h-px bg-border" />
            <ThemeMenuItems preference={theme} onChoose={chooseTheme} />
            <div role="separator" className="my-0.5 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={pending}
              className={cn(NAV_MENU_ITEM_CLASSNAME, 'disabled:opacity-60')}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {ORGANIZER_HEADER_TERMS.logoutLink}
            </button>
          </NavMenu>
        )}
      </nav>
      {failed && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger md:px-6">
          {ORGANIZER_HEADER_TERMS.logoutError}
        </p>
      )}
    </header>
  );
}
