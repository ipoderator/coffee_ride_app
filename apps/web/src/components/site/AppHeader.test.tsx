import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser, logout } from '@/lib/api/current-user';
import { SessionProvider } from '@/lib/auth/session-context';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { AppHeader } from './AppHeader';

const pushMock = vi.fn();
let pathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => pathname,
}));

vi.mock('@/lib/api/current-user', () => ({
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logoutMock = vi.mocked(logout);

const user: User = {
  id: 'user-1',
  email: 'rider@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: null,
  firstName: null,
  lastName: null,
  phone: null,
  bio: null,
  avatarUrl: null,
  profileVisibility: 'co_participants',
  distanceWeekKm: null,
  distanceMonthKm: null,
  distanceYearKm: null,
};

// Deliberately not any real feature's nav items — proves the header renders
// whatever the registries hand it (ADR-009) rather than a hard-coded set of
// known routes (`.claude/rules/extensibility.md`: registration over
// branching). This is the coverage `CabinetShell.test.tsx` carried before
// CR-108 moved the nav here.
const participantItems: CabinetNavItem[] = [
  { label: 'Первый пункт', href: '/fake/first', order: 10 },
  { label: 'Второй пункт', href: '/fake/second', order: 20, icon: 'Bell' },
];
const organizerItems: CabinetNavItem[] = [
  { label: 'Пункт организатора', href: '/fake/organizer', order: 10 },
];

function renderHeader() {
  return render(
    <SessionProvider>
      <AppHeader
        participantNavItems={participantItems}
        organizerNavItems={organizerItems}
      />
    </SessionProvider>,
  );
}

const unauthorized = () =>
  new ApiError({
    type: 'https://coffee-ride.example/errors/unauthorized',
    title: 'Unauthorized',
    status: 401,
    detail: 'No active session.',
    instance: '/v1/auth/me',
    code: 'unauthorized',
  });

describe('AppHeader', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    logoutMock.mockReset();
    pushMock.mockReset();
    pathname = '/';
  });

  it('renders every supplied participant nav item, in the order given, behind the participant menu', async () => {
    getCurrentUserMock.mockResolvedValue({ user });
    renderHeader();

    fireEvent.click(await screen.findByRole('button', { name: /Участник/ }));

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Личный кабинет');
    expect(items[1]).toHaveTextContent('Первый пункт');
    expect(items[1]).toHaveAttribute('href', '/fake/first');
    expect(items[2]).toHaveTextContent('Второй пункт');
    expect(items[2]).toHaveAttribute('href', '/fake/second');
  });

  it('renders the organizer registry behind its own menu', async () => {
    getCurrentUserMock.mockResolvedValue({ user });
    renderHeader();

    fireEvent.click(await screen.findByRole('button', { name: /Организатор/ }));

    expect(
      screen.getByRole('menuitem', { name: 'Пункт организатора' }),
    ).toHaveAttribute('href', '/fake/organizer');
  });

  it('shows the signed-out links, and neither cabinet menu, for an anonymous visitor', async () => {
    getCurrentUserMock.mockRejectedValue(unauthorized());
    renderHeader();

    expect(await screen.findByRole('link', { name: /Войти/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Регистрация/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Участник/ }),
    ).not.toBeInTheDocument();
  });

  // Guessing either way while the session is still in flight flashes the wrong
  // nav at the viewer — "Войти" at someone already signed in, or the reverse.
  it('shows neither the signed-out links nor the cabinet menus while the session is loading', () => {
    getCurrentUserMock.mockReturnValue(new Promise(() => {}));
    renderHeader();

    expect(
      screen.queryByRole('link', { name: /Войти/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Участник/ }),
    ).not.toBeInTheDocument();
  });

  it('signs out and returns to the public discovery page', async () => {
    getCurrentUserMock.mockResolvedValue({ user });
    logoutMock.mockResolvedValue(undefined);
    renderHeader();

    fireEvent.click(
      await screen.findByRole('button', { name: /rider@example\.com/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Выйти' }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith('/');
  });

  it('marks the current section on the active nav item', async () => {
    pathname = '/fake/first';
    getCurrentUserMock.mockResolvedValue({ user });
    renderHeader();

    fireEvent.click(await screen.findByRole('button', { name: /Участник/ }));

    expect(
      screen.getByRole('menuitem', { name: 'Первый пункт' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
