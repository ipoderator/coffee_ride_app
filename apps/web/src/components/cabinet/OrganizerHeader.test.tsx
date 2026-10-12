import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { getCurrentUser, logout } from '@/lib/api/current-user';
import { SessionProvider } from '@/lib/auth/session-context';
import { OrganizerHeader } from './OrganizerHeader';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/organizer',
}));

vi.mock('@/lib/api/current-user', () => ({
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logoutMock = vi.mocked(logout);

const user: User = {
  id: 'user-1',
  email: 'org@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: null,
  firstName: 'Тестовый',
  lastName: 'Организатор',
  phone: null,
  bio: null,
  avatarUrl: null,
  profileVisibility: 'co_participants',
  distanceWeekKm: null,
  distanceMonthKm: null,
  distanceYearKm: null,
};

function renderHeader() {
  return render(
    <SessionProvider>
      <OrganizerHeader />
    </SessionProvider>,
  );
}

async function openAccountMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Меню аккаунта' }));
}

describe('OrganizerHeader (CR-132)', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue({ user });
    logoutMock.mockReset();
    pushMock.mockReset();
  });

  it('shows the wordmark and «Создать заезд», and no site-wide sections', async () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Создать заезд' })).toHaveAttribute(
      'href',
      '/organizer/rides/new',
    );
    await screen.findByRole('button', { name: 'Меню аккаунта' });
    expect(screen.queryByRole('button', { name: /Мои заезды/ })).toBeNull();
  });

  it('names the signed-in account and links out of the cabinet', async () => {
    renderHeader();
    await openAccountMenu();

    expect(screen.getByText('Тестовый Организатор')).toBeInTheDocument();
    expect(screen.getByText('org@example.com')).toBeInTheDocument();
    // CR-243: the account heading is not content of the menu itself (a menu
    // owns only items) — it describes it instead.
    const menu = screen.getByRole('menu');
    expect(menu).not.toContainElement(screen.getByText('org@example.com'));
    expect(menu).toHaveAccessibleDescription(
      'Тестовый Организатор org@example.com',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Все заезды' }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('menuitem', { name: 'Кабинет участника' }),
    ).toHaveAttribute('href', '/me');
    // CR-243: one choice out of three — radio items, the current one checked.
    const options = screen.getAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual([
      'Системная',
      'Светлая',
      'Тёмная',
    ]);
    expect(
      options.filter(
        (option) => option.getAttribute('aria-checked') === 'true',
      ),
    ).toHaveLength(1);
    expect(screen.queryByRole('menuitem', { name: 'Тёмная' })).toBeNull();
  });

  it('signs out to the login page', async () => {
    logoutMock.mockResolvedValue(undefined);
    renderHeader();
    await openAccountMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Выйти' }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('has no account menu while signed out', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('offline'));
    renderHeader();

    expect(
      screen.getByRole('link', { name: 'Создать заезд' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Меню аккаунта' }),
    ).not.toBeInTheDocument();
  });
});
