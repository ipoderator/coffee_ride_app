import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS } from 'ui';
import { adminRequest } from '@/lib/admin/client';
import { setTestUrl } from '@/test-support/next-navigation';
import { makeAdminAction, page } from '@/test-support/admin';
import { AdminActionsLog } from './components/AdminActionsLog';
import { actionsFor, parseActionsFilters } from './filters';

vi.mock('next/navigation', () => import('@/test-support/next-navigation'));

vi.mock('@/lib/admin/client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/client')>()),
  adminRequest: vi.fn(),
}));
const request = vi.mocked(adminRequest);

beforeEach(() => {
  request.mockReset();
  setTestUrl('/admin/actions');
});

describe('AdminActionsLog', () => {
  it('lists each action with its target, reason and who did it', async () => {
    request.mockResolvedValue(
      page([
        makeAdminAction(),
        makeAdminAction({
          id: 'a2',
          action: 'ride_hidden',
          targetType: 'ride',
          targetLabel: 'Вечерний гравий',
          reason: 'Дубль',
        }),
        makeAdminAction({
          id: 'a3',
          action: 'admin_granted',
          targetId: '33333333-3333-4333-8333-333333333333',
          targetLabel: null,
          reason: null,
          admin: null,
        }),
        makeAdminAction({
          id: 'a4',
          action: 'review_hidden',
          targetType: 'review',
          targetId: '44444444-4444-4444-8444-444444444444',
          targetLabel: null,
        }),
      ]),
    );
    render(<AdminActionsLog />);

    expect(
      await screen.findByText(ADMIN_TERMS.actionLabels.user_blocked),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/actions');
    expect(
      screen.getByRole('link', { name: 'rider@example.com' }),
    ).toHaveAttribute(
      'href',
      '/admin/users/11111111-1111-4111-8111-111111111111',
    );
    // A ride target is text: a hidden ride's public page would 404.
    expect(screen.getByText('Вечерний гравий').closest('a')).toBeNull();
    expect(
      screen.getByText(ADMIN_TERMS.reasonLine('Дубль')),
    ).toBeInTheDocument();
    // CR-232: deleted targets stay distinct by id.
    for (const id of [
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]) {
      expect(
        screen.getByText(ADMIN_TERMS.targetMissingWithId(id)),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(ADMIN_TERMS.actorCli)).toBeInTheDocument();
  });

  describe('filters (CR-232)', () => {
    const targetSelect = () =>
      screen.getByRole('combobox', { name: ADMIN_TERMS.actionsFilterTarget });
    const actionSelect = () =>
      screen.getByRole('combobox', { name: ADMIN_TERMS.actionsFilterAction });

    it('filters by target type and action through the URL', async () => {
      request.mockResolvedValue(page([]));
      render(<AdminActionsLog />);
      await screen.findByText(ADMIN_TERMS.actionsEmpty);

      fireEvent.change(targetSelect(), { target: { value: 'ride' } });
      await waitFor(() =>
        expect(request).toHaveBeenLastCalledWith('/actions?targetType=ride'),
      );
      // Only ride actions are offered now.
      expect(
        Array.from(actionSelect().querySelectorAll('option')).map(
          (option) => option.value,
        ),
      ).toEqual(['any', 'ride_hidden', 'ride_unhidden', 'ride_cancelled']);

      fireEvent.change(actionSelect(), { target: { value: 'ride_cancelled' } });
      await waitFor(() =>
        expect(request).toHaveBeenLastCalledWith(
          '/actions?targetType=ride&action=ride_cancelled',
        ),
      );
      expect(window.location.search).toBe(
        '?targetType=ride&action=ride_cancelled',
      );
      expect(
        await screen.findByText(ADMIN_TERMS.actionsEmptyFiltered),
      ).toBeInTheDocument();

      // Switching the type drops an action that does not belong to it.
      fireEvent.change(targetSelect(), { target: { value: 'user' } });
      await waitFor(() =>
        expect(request).toHaveBeenLastCalledWith('/actions?targetType=user'),
      );
      expect(actionSelect()).toHaveValue('any');

      window.history.back();
      await waitFor(() => expect(actionSelect()).toHaveValue('ride_cancelled'));
      expect(targetSelect()).toHaveValue('ride');
    });

    it('opens with the URL filters and ignores junk', async () => {
      setTestUrl('/admin/actions?targetType=planet&action=user_blocked');
      request.mockResolvedValue(page([]));
      render(<AdminActionsLog />);
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('/actions?action=user_blocked'),
      );
      expect(targetSelect()).toHaveValue('any');
      expect(actionSelect()).toHaveValue('user_blocked');
    });

    it('parses a mismatched pair down to the type alone', () => {
      expect(
        parseActionsFilters(
          new URLSearchParams('targetType=review&action=user_blocked'),
        ),
      ).toEqual({ targetType: 'review', action: 'any' });
      expect(actionsFor('any')).toHaveLength(12);
      expect(actionsFor('user')).toContain('admin_granted');
    });
  });

  it('shows an empty log', async () => {
    request.mockResolvedValue(page([]));
    render(<AdminActionsLog />);
    expect(
      await screen.findByText(ADMIN_TERMS.actionsEmpty),
    ).toBeInTheDocument();
  });

  it('appends the next page and says when it could not', async () => {
    request.mockResolvedValueOnce(page([makeAdminAction()], 'cursor-2'));
    request.mockRejectedValueOnce(new Error('offline'));
    request.mockResolvedValueOnce(
      page([makeAdminAction({ id: 'a2', action: 'user_unblocked' })]),
    );
    render(<AdminActionsLog />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.loadMore }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.loadMoreError),
    ).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith('/actions?cursor=cursor-2');

    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.loadMore }));
    expect(
      await screen.findByText(ADMIN_TERMS.actionLabels.user_unblocked),
    ).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_TERMS.loadMoreError)).toBeNull();
    expect(
      screen.queryByRole('button', { name: ADMIN_TERMS.loadMore }),
    ).toBeNull();
  });

  it('retries a failed first page', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    request.mockResolvedValueOnce(page([makeAdminAction()]));
    render(<AdminActionsLog />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.retry }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.actionLabels.user_blocked),
    ).toBeInTheDocument();
  });
});
