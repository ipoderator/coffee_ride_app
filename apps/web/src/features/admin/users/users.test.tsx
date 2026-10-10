import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS, ToastProvider } from 'ui';
import { adminRequest } from '@/lib/admin/client';
import { setTestUrl } from '@/test-support/next-navigation';
import {
  adminProblem,
  makeAdminAction,
  makeAdminUser,
  page,
} from '@/test-support/admin';
import { AdminUserCard } from './components/AdminUserCard';
import { AdminUsersList } from './components/AdminUsersList';
import { parseUsersFilters, userCardHref, usersBackHref } from './filters';

vi.mock('next/navigation', () => import('@/test-support/next-navigation'));
vi.mock('@/lib/admin/client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/client')>()),
  adminRequest: vi.fn(),
}));
const request = vi.mocked(adminRequest);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HISTORY_PATH = `/actions?targetType=user&targetId=${USER_ID}`;

function renderWithToasts(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/** Routes the stubbed admin client by path; a missing route rejects. */
function serve(routes: Record<string, (body?: unknown) => unknown>) {
  request.mockImplementation(async (path, init) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init?.body);
  });
}

beforeEach(() => {
  request.mockReset();
  setTestUrl('/admin/users');
});

describe('AdminUsersList', () => {
  it('lists users with their kind and email state', async () => {
    serve({
      'GET /users': () =>
        page([
          makeAdminUser({ blockedAt: '2026-10-09T10:00:00.000Z' }),
          makeAdminUser({
            id: 'u2',
            email: 'org@example.com',
            displayName: null,
            emailVerified: false,
            isOrganizer: true,
          }),
        ]),
    });
    render(<AdminUsersList />);

    const link = await screen.findByRole('link', { name: 'rider@example.com' });
    expect(link).toHaveAttribute('href', `/admin/users/${USER_ID}`);
    expect(screen.getByText(ADMIN_TERMS.badgeBlocked)).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.badgeOrganizer)).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.noDisplayName)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(ADMIN_TERMS.emailUnverified)),
    ).toBeInTheDocument();
  });

  it('searches on submit and narrows by the chosen filter', async () => {
    serve({
      'GET /users': () => page([makeAdminUser()]),
      'GET /users?q=%D0%B0%D0%BD%D1%8F': () => page([makeAdminUser()]),
      'GET /users?q=%D0%B0%D0%BD%D1%8F&filter=blocked': () => page([]),
    });
    render(<AdminUsersList />);
    await screen.findByRole('link', { name: 'rider@example.com' });

    fireEvent.change(
      screen.getByRole('searchbox', { name: ADMIN_TERMS.searchUsersLabel }),
      { target: { value: '  аня ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.search }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith('/users?q=%D0%B0%D0%BD%D1%8F'),
    );

    fireEvent.change(
      screen.getByRole('combobox', { name: ADMIN_TERMS.userFilterLegend }),
      { target: { value: 'blocked' } },
    );
    expect(await screen.findByText(ADMIN_TERMS.usersEmpty)).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.emptyHint)).toBeInTheDocument();
    // CR-232: in the URL too.
    expect(window.location.search).toBe('?q=%D0%B0%D0%BD%D1%8F&filter=blocked');
  });

  it('opens with the URL filters and links each card back to them (CR-232)', async () => {
    setTestUrl('/admin/users?q=rider&filter=unverified');
    serve({
      'GET /users?q=rider&filter=unverified': () => page([makeAdminUser()]),
    });
    render(<AdminUsersList />);

    const link = await screen.findByRole('link', { name: 'rider@example.com' });
    expect(link).toHaveAttribute(
      'href',
      `/admin/users/${USER_ID}?from=q%3Drider%26filter%3Dunverified`,
    );
    expect(
      screen.getByRole('combobox', { name: ADMIN_TERMS.userFilterLegend }),
    ).toHaveValue('unverified');
    expect(
      screen.getByRole('searchbox', { name: ADMIN_TERMS.searchUsersLabel }),
    ).toHaveValue('rider');
  });

  it('falls back to the default filter for an unknown value (CR-232)', async () => {
    setTestUrl('/admin/users?filter=admins-and-friends');
    serve({ 'GET /users': () => page([makeAdminUser()]) });
    render(<AdminUsersList />);
    await screen.findByRole('link', { name: 'rider@example.com' });
    expect(
      screen.getByRole('combobox', { name: ADMIN_TERMS.userFilterLegend }),
    ).toHaveValue('all');
  });
});

describe('users list URL helpers (CR-232)', () => {
  it('parses defensively', () => {
    const long = 'я'.repeat(250);
    expect(
      parseUsersFilters(new URLSearchParams(`q=  ${long} &filter=nope`)),
    ).toEqual({ q: 'я'.repeat(200), filter: 'all' });
    expect(parseUsersFilters(new URLSearchParams('filter=blocked'))).toEqual({
      q: '',
      filter: 'blocked',
    });
  });

  it('keeps a plain card link when the filters are default', () => {
    expect(userCardHref('u1', { q: '', filter: 'all' })).toBe(
      '/admin/users/u1',
    );
  });

  it('rebuilds the back link only ever to the users list', () => {
    expect(usersBackHref(undefined)).toBe('/admin/users');
    expect(usersBackHref('q=rider&filter=blocked')).toBe(
      '/admin/users?q=rider&filter=blocked',
    );
    for (const hostile of [
      'https://evil.example',
      '//evil.example',
      'filter=../../logout',
      'q=x&next=https://evil.example',
    ]) {
      expect(usersBackHref(hostile)).toMatch(/^\/admin\/users(\?|$)/);
    }
    expect(usersBackHref('q=x&next=https://evil.example')).toBe(
      '/admin/users?q=x',
    );
  });
});

describe('AdminUserCard', () => {
  it('leads back to the list it was opened from (CR-232)', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({ user: makeAdminUser() }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
    });
    renderWithToasts(
      <AdminUserCard
        userId={USER_ID}
        backHref={usersBackHref('q=rider&filter=blocked')}
      />,
    );
    expect(
      await screen.findByRole('link', { name: ADMIN_TERMS.backToUsers }),
    ).toHaveAttribute('href', '/admin/users?q=rider&filter=blocked');
  });

  it('shows the account facts and its own action history', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({
        user: makeAdminUser({ organizer: { id: 'o1', name: 'Рассвет' } }),
      }),
      [`GET ${HISTORY_PATH}`]: () =>
        page([
          makeAdminAction({ action: 'user_sessions_revoked', reason: null }),
        ]),
    });
    render(<AdminUserCard userId={USER_ID} />);

    expect(
      await screen.findByRole('heading', { name: 'rider@example.com' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Рассвет')).toBeInTheDocument();
    expect(
      await screen.findByText(ADMIN_TERMS.actionLabels.user_sessions_revoked),
    ).toBeInTheDocument();
    // The history is about this user — no target line per row.
    expect(
      screen.queryByRole('link', { name: 'rider@example.com' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: ADMIN_TERMS.backToUsers }),
    ).toHaveAttribute('href', '/admin/users');
  });

  it('says so when the user does not exist', async () => {
    request.mockImplementation(async (path) => {
      if (path === `/users/${USER_ID}`) throw adminProblem(404, 'not_found');
      return page([]);
    });
    render(<AdminUserCard userId={USER_ID} />);
    expect(
      await screen.findByText(ADMIN_TERMS.userNotFound),
    ).toBeInTheDocument();
  });

  it('retries a failed load', async () => {
    let calls = 0;
    serve({
      [`GET /users/${USER_ID}`]: () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        return { user: makeAdminUser() };
      },
      [`GET ${HISTORY_PATH}`]: () => page([]),
    });
    render(<AdminUserCard userId={USER_ID} />);
    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.retry }),
    );
    expect(
      await screen.findByRole('heading', { name: 'rider@example.com' }),
    ).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.historyEmpty)).toBeInTheDocument();
  });

  it('blocks with a required reason, then shows the block and its log row', async () => {
    let blocked = false;
    serve({
      [`GET /users/${USER_ID}`]: () => ({ user: makeAdminUser() }),
      [`GET ${HISTORY_PATH}`]: () =>
        page(blocked ? [makeAdminAction({ reason: 'Спам' })] : []),
      [`POST /users/${USER_ID}/block`]: (body) => {
        expect(body).toEqual({ reason: 'Спам' });
        blocked = true;
        return {
          user: makeAdminUser({
            blockedAt: '2026-10-10T08:00:00.000Z',
            blockReason: 'Спам',
            activeSessions: 0,
          }),
        };
      },
    });
    renderWithToasts(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.block }),
    );
    const dialog = screen.getByRole('dialog', { name: ADMIN_TERMS.blockTitle });
    // CR-232: the dialog names the account it blocks.
    expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining('rider@example.com'),
    );
    expect(
      within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel),
    ).toHaveAccessibleDescription(ADMIN_TERMS.reasonHintLogOnly);
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.block }),
    );
    expect(
      within(dialog).getByText(ADMIN_TERMS.reasonRequired),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: '  Спам  ' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.block }),
    );

    expect(await screen.findByText(ADMIN_TERMS.blockDone)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    // The notice's title and the new log row read the same words.
    await waitFor(() =>
      expect(screen.getAllByText(ADMIN_TERMS.blockedTitle)).toHaveLength(2),
    );
    expect(ADMIN_TERMS.actionLabels.user_blocked).toBe(
      ADMIN_TERMS.blockedTitle,
    );
    expect(screen.getAllByText(ADMIN_TERMS.reasonLine('Спам'))).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: ADMIN_TERMS.unblock }),
    ).toBeInTheDocument();
  });

  it('keeps the dialog open with a Russian line when the block is refused', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({ user: makeAdminUser() }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
      [`POST /users/${USER_ID}/block`]: () => {
        throw adminProblem(409, 'cannot_block_admin');
      },
    });
    render(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.block }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Проверка' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.block }),
    );
    expect(
      await within(dialog).findByText(ADMIN_TERMS.adminCannotBeBlocked),
    ).toBeInTheDocument();
    expect(screen.queryByText(/English detail/)).toBeNull();

    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.cancel }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cannot be dismissed while the block is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    serve({
      [`GET /users/${USER_ID}`]: () => ({ user: makeAdminUser() }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
      [`POST /users/${USER_ID}/block`]: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    renderWithToasts(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.block }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Спам' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.block }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(`/users/${USER_ID}/block`, {
        method: 'POST',
        body: { reason: 'Спам' },
      }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    finish({
      user: makeAdminUser({ blockedAt: '2026-10-10T08:00:00.000Z' }),
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers no block for an admin account', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({
        user: makeAdminUser({ isAdmin: true }),
      }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
    });
    render(<AdminUserCard userId={USER_ID} />);
    expect(
      await screen.findByText(ADMIN_TERMS.adminCannotBeBlocked),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ADMIN_TERMS.block }),
    ).toBeNull();
    expect(screen.getByText(ADMIN_TERMS.badgeAdmin)).toBeInTheDocument();
  });

  it('verifies the email and resends the letter for an unverified account', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({
        user: makeAdminUser({ emailVerified: false }),
      }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
      [`POST /users/${USER_ID}/resend-verification`]: () => undefined,
      [`POST /users/${USER_ID}/verify-email`]: () => ({
        user: makeAdminUser(),
      }),
    });
    renderWithToasts(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: ADMIN_TERMS.resendVerification,
      }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.resendVerificationDone),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: ADMIN_TERMS.verifyEmail }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.verifyEmailDone),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ADMIN_TERMS.verifyEmail }),
    ).toBeNull();
  });

  it('ends every session after a confirmation', async () => {
    serve({
      [`GET /users/${USER_ID}`]: () => ({ user: makeAdminUser() }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
      [`POST /users/${USER_ID}/revoke-sessions`]: () => ({ revoked: 2 }),
    });
    renderWithToasts(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.revokeSessions }),
    );
    const dialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.revokeSessionsTitle,
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.revokeSessions }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.revokeSessionsDone(2)),
    ).toBeInTheDocument();
    const sessions = screen.getByText(ADMIN_TERMS.factSessions)
      .parentElement as HTMLElement;
    expect(within(sessions).getByText('0')).toBeInTheDocument();
  });

  it('unblocks after a confirmation and reports a failure as a toast', async () => {
    let fail = true;
    serve({
      [`GET /users/${USER_ID}`]: () => ({
        user: makeAdminUser({
          blockedAt: '2026-10-09T10:00:00.000Z',
          blockReason: null,
        }),
      }),
      [`GET ${HISTORY_PATH}`]: () => page([]),
      [`POST /users/${USER_ID}/unblock`]: () => {
        if (fail) throw new Error('offline');
        return { user: makeAdminUser() };
      },
    });
    renderWithToasts(<AdminUserCard userId={USER_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.unblock }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: ADMIN_TERMS.unblock,
      }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.actionError),
    ).toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.unblock }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: ADMIN_TERMS.unblock,
      }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.unblockDone),
    ).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_TERMS.blockedTitle)).toBeNull();
  });
});
