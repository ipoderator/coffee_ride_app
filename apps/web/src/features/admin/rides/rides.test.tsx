import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS, RIDE_STATUS_TERMS, ToastProvider } from 'ui';
import { adminRequest } from '@/lib/admin/client';
import { setTestUrl } from '@/test-support/next-navigation';
import { adminProblem, makeAdminRide, page } from '@/test-support/admin';
import { AdminRidesList } from './components/AdminRidesList';

vi.mock('next/navigation', () => import('@/test-support/next-navigation'));
vi.mock('@/lib/admin/client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/client')>()),
  adminRequest: vi.fn(),
}));
const request = vi.mocked(adminRequest);

const RIDE_ID = '22222222-2222-4222-8222-222222222222';

function rowOf(title: string): HTMLElement {
  return screen.getByText(title).closest('li') as HTMLElement;
}

beforeEach(() => {
  request.mockReset();
  setTestUrl('/admin/rides');
});

describe('AdminRidesList', () => {
  it('lists rides with their state; only a public ride links to its page', async () => {
    request.mockResolvedValue(
      page([
        makeAdminRide(),
        makeAdminRide({
          id: 'r2',
          title: 'Скрытый заезд',
          hiddenAt: '2026-10-09T10:00:00.000Z',
          hiddenReason: 'Реклама',
        }),
        makeAdminRide({ id: 'r3', title: 'Черновик клуба', status: 'draft' }),
      ]),
    );
    render(<AdminRidesList />);

    const open = await screen.findByRole('link', {
      name: 'Утренний круг по набережной',
    });
    expect(open).toHaveAttribute('href', `/rides/${RIDE_ID}`);
    expect(request).toHaveBeenCalledWith('/rides');

    const hidden = rowOf('Скрытый заезд');
    expect(
      within(hidden).queryByRole('link', { name: 'Скрытый заезд' }),
    ).toBeNull();
    expect(
      within(hidden).getByText(ADMIN_TERMS.badgeHidden),
    ).toBeInTheDocument();
    expect(
      within(hidden).getByText(ADMIN_TERMS.reasonLine('Реклама')),
    ).toBeInTheDocument();
    expect(
      within(hidden).getByRole('button', { name: ADMIN_TERMS.unhide }),
    ).toBeInTheDocument();

    const draft = rowOf('Черновик клуба');
    expect(
      within(draft).queryByRole('link', { name: 'Черновик клуба' }),
    ).toBeNull();
    // A draft cannot be cancelled — the API would refuse it.
    expect(
      within(draft).queryByRole('button', { name: ADMIN_TERMS.cancelRide }),
    ).toBeNull();

    const row = rowOf('Утренний круг по набережной');
    expect(
      within(row).getByRole('link', { name: 'Велоклуб «Рассвет»' }),
    ).toHaveAttribute(
      'href',
      '/admin/users/44444444-4444-4444-8444-444444444444',
    );
    // The start is in the ride's own zone (05:00Z = 08:00 МСК).
    expect(within(row).getByText(/08:00 · МСК/)).toBeInTheDocument();
  });

  it('narrows by search, status and visibility', async () => {
    request.mockResolvedValue(page([]));
    render(<AdminRidesList />);
    await screen.findByText(ADMIN_TERMS.ridesEmpty);

    fireEvent.change(
      screen.getByRole('searchbox', { name: ADMIN_TERMS.searchRidesLabel }),
      { target: { value: 'круг' } },
    );
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.change(
      screen.getByRole('combobox', { name: ADMIN_TERMS.rideStatusLabel }),
      { target: { value: 'cancelled' } },
    );
    fireEvent.click(
      screen.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
    );

    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        '/rides?q=%D0%BA%D1%80%D1%83%D0%B3&status=cancelled&visibility=hidden',
      ),
    );
    expect(
      screen.getByRole('option', { name: RIDE_STATUS_TERMS.cancelled.label }),
    ).toBeInTheDocument();
    // CR-232: the same filters are in the page URL.
    expect(window.location.pathname + window.location.search).toBe(
      '/admin/rides?q=%D0%BA%D1%80%D1%83%D0%B3&status=cancelled&visibility=hidden',
    );
  });

  describe('filters in the URL (CR-232)', () => {
    it('opens with the URL filters and drops unknown values', async () => {
      setTestUrl('/admin/rides?q=круг&status=bogus&visibility=hidden&x=1');
      request.mockResolvedValue(page([]));
      render(<AdminRidesList />);
      await screen.findByText(ADMIN_TERMS.ridesEmpty);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        '/rides?q=%D0%BA%D1%80%D1%83%D0%B3&visibility=hidden',
      );
      expect(
        screen.getByRole('searchbox', { name: ADMIN_TERMS.searchRidesLabel }),
      ).toHaveValue('круг');
      expect(
        screen.getByRole('combobox', { name: ADMIN_TERMS.rideStatusLabel }),
      ).toHaveValue('any');
      expect(
        screen.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
      ).toBeChecked();
    });

    it('searches only on submit, not on every keystroke', async () => {
      request.mockResolvedValue(page([]));
      render(<AdminRidesList />);
      await screen.findByText(ADMIN_TERMS.ridesEmpty);
      const box = screen.getByRole('searchbox', {
        name: ADMIN_TERMS.searchRidesLabel,
      });
      for (const value of ['к', 'кр', 'кру']) {
        fireEvent.change(box, { target: { value } });
      }
      expect(request).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe('');

      fireEvent.submit(screen.getByRole('search'));
      await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      // A repeat of the same search adds no history entry and no request.
      const entries = window.history.length;
      fireEvent.submit(screen.getByRole('search'));
      expect(window.history.length).toBe(entries);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('restores filters and the search box on back and forward', async () => {
      request.mockResolvedValue(page([]));
      render(<AdminRidesList />);
      await screen.findByText(ADMIN_TERMS.ridesEmpty);
      const box = screen.getByRole('searchbox', {
        name: ADMIN_TERMS.searchRidesLabel,
      });
      const status = screen.getByRole('combobox', {
        name: ADMIN_TERMS.rideStatusLabel,
      });

      fireEvent.change(box, { target: { value: 'круг' } });
      fireEvent.submit(screen.getByRole('search'));
      fireEvent.change(status, { target: { value: 'cancelled' } });
      await waitFor(() => expect(status).toHaveValue('cancelled'));

      window.history.back();
      await waitFor(() => expect(status).toHaveValue('any'));
      expect(box).toHaveValue('круг');
      expect(request).toHaveBeenLastCalledWith(
        '/rides?q=%D0%BA%D1%80%D1%83%D0%B3',
      );

      window.history.back();
      await waitFor(() => expect(box).toHaveValue(''));
      expect(request).toHaveBeenLastCalledWith('/rides');

      window.history.forward();
      await waitFor(() => expect(box).toHaveValue('круг'));
      window.history.forward();
      await waitFor(() => expect(status).toHaveValue('cancelled'));
      expect(request).toHaveBeenLastCalledWith(
        '/rides?q=%D0%BA%D1%80%D1%83%D0%B3&status=cancelled',
      );
    });
  });

  it('hides a ride with a reason and unhides it', async () => {
    request.mockImplementation(async (path, init) => {
      if (path === `/rides/${RIDE_ID}/hide`) {
        expect(init?.body).toEqual({ reason: 'Реклама' });
        return {
          ride: makeAdminRide({
            hiddenAt: '2026-10-10T08:00:00.000Z',
            hiddenReason: 'Реклама',
          }),
        };
      }
      if (path === `/rides/${RIDE_ID}/unhide`) return { ride: makeAdminRide() };
      return page([makeAdminRide()]);
    });
    render(
      <ToastProvider>
        <AdminRidesList />
      </ToastProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.hideRide }),
    );
    const dialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.hideRideTitle,
    });
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Реклама' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.hideRide }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.hideRideDone),
    ).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.badgeHidden)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.unhide }));
    expect(
      await screen.findByText(ADMIN_TERMS.unhideRideDone),
    ).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_TERMS.badgeHidden)).toBeNull();
  });

  it('names the clicked ride in the hide and cancel dialogs (CR-232)', async () => {
    const longTitle = `Гревел-${'очень-длинное-название-'.repeat(8)}`;
    request.mockImplementation(async () =>
      page([makeAdminRide(), makeAdminRide({ id: 'r2', title: longTitle })]),
    );
    render(
      <ToastProvider>
        <AdminRidesList />
      </ToastProvider>,
    );

    const hideButtons = await screen.findAllByRole('button', {
      name: ADMIN_TERMS.hideRide,
    });
    fireEvent.click(hideButtons[1]!);
    const hideDialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.hideRideTitle,
    });
    expect(hideDialog).toHaveAccessibleDescription(
      expect.stringContaining(longTitle),
    );
    expect(within(hideDialog).getByText(longTitle)).toHaveClass(
      'wrap-anywhere',
    );
    // The organizer reads a hide reason — the hint says so.
    expect(
      within(hideDialog).getByLabelText(ADMIN_TERMS.reasonLabel),
    ).toHaveAccessibleDescription(ADMIN_TERMS.reasonHintOrganizerVisible);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(
      screen.getAllByRole('button', { name: ADMIN_TERMS.cancelRide })[0]!,
    );
    const cancelDialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.cancelRideTitle,
    });
    expect(cancelDialog).toHaveAccessibleDescription(
      expect.stringContaining('Утренний круг по набережной'),
    );
    expect(cancelDialog).not.toHaveAccessibleDescription(
      expect.stringContaining(longTitle),
    );
    expect(
      within(cancelDialog).getByLabelText(ADMIN_TERMS.reasonLabel),
    ).toHaveAccessibleDescription(ADMIN_TERMS.reasonHintLogOnly);
  });

  it('cancels a ride and explains a refused cancellation', async () => {
    let refuse = true;
    request.mockImplementation(async (path) => {
      if (path === `/rides/${RIDE_ID}/cancel`) {
        if (refuse) throw adminProblem(409, 'ride_not_cancellable');
        return { ride: makeAdminRide({ status: 'cancelled' }) };
      }
      if (path === `/rides/${RIDE_ID}/unhide`) throw new Error('offline');
      return page([makeAdminRide()]);
    });
    render(
      <ToastProvider>
        <AdminRidesList />
      </ToastProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.cancelRide }),
    );
    let dialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.cancelRideTitle,
    });
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Организатор пропал' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.cancelRide }),
    );
    expect(
      await within(dialog).findByText(ADMIN_TERMS.rideNotCancellable),
    ).toBeInTheDocument();

    refuse = false;
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.cancelRide }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.cancelRideDone),
    ).toBeInTheDocument();
    dialog = screen.queryByRole('dialog') as HTMLElement;
    expect(dialog).toBeNull();
    expect(
      screen.getByText(RIDE_STATUS_TERMS.cancelled.label, { selector: 'span' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ADMIN_TERMS.cancelRide }),
    ).toBeNull();
  });

  it('reports a failed unhide', async () => {
    request.mockImplementation(async (path) => {
      if (path.endsWith('/unhide')) throw new Error('offline');
      return page([makeAdminRide({ hiddenAt: '2026-10-10T08:00:00.000Z' })]);
    });
    render(
      <ToastProvider>
        <AdminRidesList />
      </ToastProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.unhide }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.actionError),
    ).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.badgeHidden)).toBeInTheDocument();
  });
});
