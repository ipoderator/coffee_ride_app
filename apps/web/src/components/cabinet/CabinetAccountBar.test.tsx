import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser, logout } from '@/lib/api/current-user';
import { SessionProvider } from '@/lib/auth/session-context';
import { CabinetAccountBar } from './CabinetAccountBar';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
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

function renderBar(u: User = user) {
  return render(
    <SessionProvider>
      <CabinetAccountBar user={u} />
    </SessionProvider>,
  );
}

describe('CabinetAccountBar', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue({ user });
    logoutMock.mockReset();
    pushMock.mockReset();
  });

  it('shows the real name and e-mail of the signed-in account', () => {
    renderBar({ ...user, firstName: 'Анна', lastName: 'Иванова' });

    const bar = screen.getByRole('region', { name: 'Текущий аккаунт' });
    expect(bar).toHaveTextContent(
      'Вы вошли как Анна Иванова · rider@example.com',
    );
  });

  it('falls back to the display name, then to the e-mail alone', () => {
    const { unmount } = renderBar({ ...user, displayName: 'Велосипедист' });
    expect(screen.getByRole('region')).toHaveTextContent(
      'Вы вошли как Велосипедист · rider@example.com',
    );
    unmount();

    renderBar();
    expect(screen.getByRole('region')).toHaveTextContent(
      /^Вы вошли как rider@example\.comВыйти$/,
    );
  });

  it('signs out and goes to the login page to switch accounts', async () => {
    logoutMock.mockResolvedValue(undefined);
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('treats an already-expired session as signed out', async () => {
    logoutMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No active session.',
        instance: '/v1/auth/logout',
        code: 'unauthorized',
      }),
    );
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and stays put when sign-out fails', async () => {
    logoutMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выйти. Попробуйте ещё раз.',
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled();
  });
});
