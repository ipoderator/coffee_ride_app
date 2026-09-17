import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { ApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/api/current-user';
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
  phone: null,
  bio: null,
};

// Deliberately not any real feature's nav item — proves `CabinetShell`
// renders whatever list it's handed (ADR-009) rather than a hard-coded set
// of known routes (`.claude/rules/extensibility.md`: registration over
// branching).
const fakeNavItems: CabinetNavItem[] = [
  { label: 'Первый пункт', href: '/fake/first', order: 10 },
  { label: 'Второй пункт', href: '/fake/second', order: 20 },
];

describe('CabinetShell', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    replaceMock.mockReset();
  });

  it('renders every supplied nav item, in the order given, as a link to its href', async () => {
    getCurrentUserMock.mockResolvedValue({ user });

    render(
      <CabinetShell navItems={fakeNavItems}>
        <p>Содержимое кабинета</p>
      </CabinetShell>,
    );

    await screen.findByText('Содержимое кабинета');

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Первый пункт');
    expect(links[0]).toHaveAttribute('href', '/fake/first');
    expect(links[1]).toHaveTextContent('Второй пункт');
    expect(links[1]).toHaveAttribute('href', '/fake/second');
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

    render(
      <CabinetShell navItems={fakeNavItems}>
        <p>Содержимое кабинета</p>
      </CabinetShell>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Содержимое кабинета')).not.toBeInTheDocument();
  });

  it('shows a generic error state on a non-401 failure', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('network down'));

    render(
      <CabinetShell navItems={fakeNavItems}>
        <p>Содержимое кабинета</p>
      </CabinetShell>,
    );

    expect(
      await screen.findByText('Не удалось загрузить данные аккаунта.'),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
