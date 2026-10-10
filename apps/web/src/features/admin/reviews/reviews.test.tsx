import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS, ToastProvider } from 'ui';
import { adminRequest } from '@/lib/admin/client';
import { setTestUrl } from '@/test-support/next-navigation';
import { makeAdminReview, page } from '@/test-support/admin';
import { AdminReviewsList } from './components/AdminReviewsList';

vi.mock('next/navigation', () => import('@/test-support/next-navigation'));
vi.mock('@/lib/admin/client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/client')>()),
  adminRequest: vi.fn(),
}));
const request = vi.mocked(adminRequest);

const REVIEW_ID = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  request.mockReset();
  setTestUrl('/admin/reviews');
});

describe('AdminReviewsList', () => {
  it('reads visibility from the URL, writes it back, ignores junk (CR-232)', async () => {
    setTestUrl('/admin/reviews?visibility=hidden');
    request.mockResolvedValue(page([]));
    const { unmount } = render(
      <ToastProvider>
        <AdminReviewsList />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/reviews?visibility=hidden'),
    );
    fireEvent.click(
      screen.getByRole('radio', { name: ADMIN_TERMS.visibility.visible }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith('/reviews?visibility=visible'),
    );
    expect(window.location.search).toBe('?visibility=visible');
    window.history.back();
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
      ).toBeChecked(),
    );
    unmount();

    setTestUrl('/admin/reviews?visibility=everything');
    request.mockClear();
    render(
      <ToastProvider>
        <AdminReviewsList />
      </ToastProvider>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledWith('/reviews'));
    expect(
      screen.getByRole('radio', { name: ADMIN_TERMS.visibility.all }),
    ).toBeChecked();
  });

  it('lists reviews with rating, text, ride and author', async () => {
    request.mockResolvedValue(
      page([
        makeAdminReview(),
        makeAdminReview({
          id: 'v2',
          comment: null,
          author: { id: 'u2', email: 'quiet@example.com', displayName: null },
          hiddenAt: '2026-10-09T10:00:00.000Z',
          hiddenReason: 'Оскорбления',
        }),
      ]),
    );
    render(<AdminReviewsList />);

    expect(
      await screen.findByText('Хороший темп, но долгая остановка на кофе.'),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/reviews');
    expect(screen.getAllByText(ADMIN_TERMS.ratingLabel(4))).toHaveLength(2);
    expect(screen.getByText(ADMIN_TERMS.noComment)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        ADMIN_TERMS.reviewOnRide('Утренний круг по набережной'),
      ),
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Аня Петрова' })).toHaveAttribute(
      'href',
      '/admin/users/11111111-1111-4111-8111-111111111111',
    );
    // No display name — the email stands in.
    expect(
      screen.getByRole('link', { name: 'quiet@example.com' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ADMIN_TERMS.reasonLine('Оскорбления')),
    ).toBeInTheDocument();
  });

  it('switches to hidden reviews only', async () => {
    request.mockResolvedValue(page([]));
    render(<AdminReviewsList />);
    await screen.findByText(ADMIN_TERMS.reviewsEmpty);

    fireEvent.click(
      screen.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
    );
    await screen.findByText(ADMIN_TERMS.reviewsEmpty);
    expect(request).toHaveBeenLastCalledWith('/reviews?visibility=hidden');
  });

  it('hides a review with a reason and brings it back', async () => {
    request.mockImplementation(async (path, init) => {
      if (path === `/reviews/${REVIEW_ID}/hide`) {
        expect(init?.body).toEqual({ reason: 'Оскорбления' });
        return {
          review: makeAdminReview({
            hiddenAt: '2026-10-10T08:00:00.000Z',
            hiddenReason: 'Оскорбления',
          }),
        };
      }
      if (path === `/reviews/${REVIEW_ID}/unhide`) {
        return { review: makeAdminReview() };
      }
      return page([makeAdminReview()]);
    });
    render(
      <ToastProvider>
        <AdminReviewsList />
      </ToastProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    const dialog = screen.getByRole('dialog', {
      name: ADMIN_TERMS.hideReviewTitle,
    });
    // CR-232: author, rating and the start of the text name the review.
    for (const part of [
      'Аня Петрова',
      ADMIN_TERMS.ratingLabel(4),
      'Хороший темп, но долгая остановка на кофе.',
    ]) {
      expect(dialog).toHaveAccessibleDescription(expect.stringContaining(part));
    }
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Оскорбления' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.hideReviewDone),
    ).toBeInTheDocument();
    expect(screen.getByText(ADMIN_TERMS.badgeHidden)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.unhide }));
    expect(
      await screen.findByText(ADMIN_TERMS.unhideReviewDone),
    ).toBeInTheDocument();
  });

  it('says «Без текста» in the dialog for a review with no comment (CR-232)', async () => {
    request.mockImplementation(async () =>
      page([makeAdminReview({ comment: null, rating: 2 })]),
    );
    render(
      <ToastProvider>
        <AdminReviewsList />
      </ToastProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(ADMIN_TERMS.noComment),
    );
    expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(ADMIN_TERMS.ratingLabel(2)),
    );
    expect(
      within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel),
    ).toHaveAccessibleDescription(ADMIN_TERMS.reasonHintLogOnly);
  });

  it('keeps the dialog open when hiding fails, and toasts a failed unhide', async () => {
    request.mockImplementation(async (path) => {
      if (path.endsWith('/hide') || path.endsWith('/unhide')) {
        throw new Error('offline');
      }
      return page([
        makeAdminReview(),
        makeAdminReview({ id: 'v2', hiddenAt: '2026-10-10T08:00:00.000Z' }),
      ]);
    });
    render(
      <ToastProvider>
        <AdminReviewsList />
      </ToastProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(ADMIN_TERMS.reasonLabel), {
      target: { value: 'Спам' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    expect(
      await within(dialog).findByText(ADMIN_TERMS.actionError),
    ).toBeInTheDocument();
    // The error commits before Dialog's passive effect swaps the in-flight
    // `ignoreClose` back for `onClose` — retry Escape until it is rebound.
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: ADMIN_TERMS.unhide }));
    expect(
      await screen.findByText(ADMIN_TERMS.actionError),
    ).toBeInTheDocument();
  });
});
