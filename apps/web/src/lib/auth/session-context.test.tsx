import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { SessionProvider, useSession } from './session-context';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));

const getCurrentUserMock = vi.mocked(getCurrentUser);

const user = {
  id: '1',
  email: 'rider@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: null,
  firstName: null,
  lastName: null,
  phone: null,
  bio: null,
  avatarUrl: null,
  profileVisibility: 'co_participants' as const,
  distanceWeekKm: null,
  distanceMonthKm: null,
  distanceYearKm: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Status() {
  const session = useSession();
  return (
    <>
      <p>{session.status}</p>
      <button type="button" onClick={session.refresh}>
        refresh
      </button>
    </>
  );
}

function tree() {
  return (
    <StrictMode>
      <SessionProvider>
        <Status />
      </SessionProvider>
    </StrictMode>
  );
}

// CR-212 follow-up. The cabinet stuck on «Загрузка личного кабинета…» under
// Next 16 was suspected to be this provider losing its response to an effect
// re-run; it was the dev-server route reload (`e2e/warmup.setup.ts`). Unlike
// `VerifyEmailStatus`'s single-use token, `/me` is idempotent, so a re-run's
// second request is harmless and its own response resolves the session.
describe('SessionProvider', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it('resolves when the effect re-runs before the response lands', async () => {
    const pending = deferred<{ user: typeof user }>();
    getCurrentUserMock.mockReturnValue(pending.promise);
    const { rerender } = render(tree());
    rerender(tree());

    await act(async () => pending.resolve({ user }));

    expect(await screen.findByText('authenticated')).toBeInTheDocument();
  });

  it('refresh() requests the session again', async () => {
    getCurrentUserMock.mockResolvedValue({ user });
    render(tree());
    await screen.findByText('authenticated');
    const calls = getCurrentUserMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    expect(await screen.findByText('authenticated')).toBeInTheDocument();
    expect(getCurrentUserMock.mock.calls.length).toBeGreaterThan(calls);
  });
});
