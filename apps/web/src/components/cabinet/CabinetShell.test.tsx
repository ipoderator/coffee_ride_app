import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/api/current-user';
import { SessionProvider } from '@/lib/auth/session-context';
import { CabinetShell } from './CabinetShell';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/api/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);

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

function renderShell() {
  return render(
    <SessionProvider>
      <CabinetShell>
        <p>Содержимое кабинета</p>
      </CabinetShell>
    </SessionProvider>,
  );
}

// CR-108 narrowed this component to the session gate — the nav it used to own
// moved to `AppHeader`, and so did the ADR-009 registry coverage
// (`components/site/AppHeader.test.tsx`).
describe('CabinetShell', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    replaceMock.mockReset();
  });

  it('renders its children once the session resolves', async () => {
    getCurrentUserMock.mockResolvedValue({ user });

    renderShell();

    expect(await screen.findByText('Содержимое кабинета')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to /login on an unauthenticated session, without rendering children', async () => {
    getCurrentUserMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No active session.',
        instance: '/v1/auth/me',
        code: 'unauthorized',
      }),
    );

    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Содержимое кабинета')).not.toBeInTheDocument();
  });

  it('shows a generic error state on a non-401 failure, and does not redirect', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('network down'));

    renderShell();

    expect(
      await screen.findByText('Не удалось загрузить данные аккаунта.'),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  // A signed-out visitor is mid-redirect, not broken: showing them the error
  // copy would be wrong, and showing them the protected children would be a
  // leak.
  it('keeps the loading state rather than the error state while the /login redirect is in flight', async () => {
    getCurrentUserMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No active session.',
        instance: '/v1/auth/me',
        code: 'unauthorized',
      }),
    );

    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(
      screen.queryByText('Не удалось загрузить данные аккаунта.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Загрузка личного кабинета…'),
    ).toBeInTheDocument();
  });
});
