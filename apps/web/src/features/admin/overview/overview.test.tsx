import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS } from 'ui';
import { adminRequest } from '@/lib/admin/client';
import { makeAdminOverview } from '@/test-support/admin';
import { ADMIN_LIST_LINKS } from '@/lib/admin/list-links';
// Test-only cross-feature imports: each overview link must parse into exactly
// the filter it promises in the list it opens.
import { parseReviewsFilters } from '../reviews/filters';
import { parseRidesFilters } from '../rides/filters';
import { parseUsersFilters } from '../users/filters';
import { AdminOverview } from './components/AdminOverview';
import { adminOverviewNavItem } from './nav';

vi.mock('@/lib/admin/client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/client')>()),
  adminRequest: vi.fn(),
}));
const request = vi.mocked(adminRequest);

beforeEach(() => {
  request.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const query = (href: string) => new URLSearchParams(href.split('?')[1]);

describe('AdminOverview', () => {
  it('shows the platform counters and every dependency state', async () => {
    request.mockResolvedValue({ overview: makeAdminOverview() });
    render(<AdminOverview />);

    expect(await screen.findByText('1 240')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/overview');
    expect(screen.getByText(ADMIN_TERMS.organizersTotal)).toBeInTheDocument();
    expect(screen.getByText('210')).toBeInTheDocument();

    const redis = screen
      .getByText(ADMIN_TERMS.services.redis)
      .closest('li') as HTMLElement;
    expect(within(redis).getByText('Ошибка')).toBeInTheDocument();
    const email = screen
      .getByText(ADMIN_TERMS.services.email)
      .closest('li') as HTMLElement;
    expect(within(email).getByText('Не настроен')).toBeInTheDocument();
  });

  it('offers a retry when the overview cannot be read', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    request.mockResolvedValueOnce({ overview: makeAdminOverview() });
    render(<AdminOverview />);

    fireEvent.click(
      await screen.findByRole('button', { name: ADMIN_TERMS.retry }),
    );
    expect(await screen.findByText('1 240')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('links the counters that have an exact list filter (CR-232)', async () => {
    request.mockResolvedValue({ overview: makeAdminOverview() });
    render(<AdminOverview />);
    await screen.findByText('1 240');

    const links = screen
      .getAllByRole('link')
      .map((link) => [
        link.getAttribute('aria-label'),
        link.getAttribute('href'),
      ]);
    expect(links).toEqual([
      [
        ADMIN_TERMS.metricOpenList(
          ADMIN_TERMS.overviewUsers,
          ADMIN_TERMS.usersUnverified,
          '18',
        ),
        '/admin/users?filter=unverified',
      ],
      [
        ADMIN_TERMS.metricOpenList(
          ADMIN_TERMS.overviewUsers,
          ADMIN_TERMS.usersBlocked,
          '2',
        ),
        '/admin/users?filter=blocked',
      ],
      [
        ADMIN_TERMS.metricOpenList(
          ADMIN_TERMS.overviewRides,
          ADMIN_TERMS.ridesHidden,
          '1',
        ),
        '/admin/rides?visibility=hidden',
      ],
      [
        ADMIN_TERMS.metricOpenList(
          ADMIN_TERMS.overviewReviews,
          ADMIN_TERMS.reviewsHidden,
          '3',
        ),
        '/admin/reviews?visibility=hidden',
      ],
    ]);
    // A counter without an exact filter («Всего») stays plain text.
    expect(
      screen.queryByRole('link', { name: new RegExp(ADMIN_TERMS.usersTotal) }),
    ).toBeNull();
  });

  it('points each link at a filter the list really parses', () => {
    expect(parseUsersFilters(query(ADMIN_LIST_LINKS.unverifiedUsers))).toEqual({
      q: '',
      filter: 'unverified',
    });
    expect(parseUsersFilters(query(ADMIN_LIST_LINKS.blockedUsers)).filter).toBe(
      'blocked',
    );
    expect(
      parseRidesFilters(query(ADMIN_LIST_LINKS.hiddenRides)).visibility,
    ).toBe('hidden');
    expect(
      parseReviewsFilters(query(ADMIN_LIST_LINKS.hiddenReviews)).visibility,
    ).toBe('hidden');
  });

  it('refreshes in place and stamps the time of the last success (CR-232)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T11:05:07Z'));
    request.mockResolvedValueOnce({ overview: makeAdminOverview() });
    render(<AdminOverview />);
    expect(
      await screen.findByText(
        ADMIN_TERMS.servicesUpdatedAt('10 октября, 14:05:07'),
      ),
    ).toBeInTheDocument();

    vi.setSystemTime(new Date('2026-10-10T11:06:30Z'));
    let answer!: (value: unknown) => void;
    request.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: ADMIN_TERMS.servicesRefresh }),
    );
    // The current numbers stay on screen while the refresh runs.
    expect(screen.getByText('1 240')).toBeInTheDocument();
    answer({
      overview: {
        ...makeAdminOverview(),
        users: { total: 1241, newLast7Days: 0, unverified: 0, blocked: 0 },
      },
    });
    expect(await screen.findByText('1 241')).toBeInTheDocument();
    expect(
      screen.getByText(ADMIN_TERMS.servicesUpdatedAt('10 октября, 14:06:30')),
    ).toBeInTheDocument();
  });

  it('keeps the last data and its time when a refresh fails (CR-232)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T11:05:07Z'));
    request.mockResolvedValueOnce({ overview: makeAdminOverview() });
    request.mockRejectedValueOnce(new Error('offline'));
    render(<AdminOverview />);
    await screen.findByText('1 240');

    vi.setSystemTime(new Date('2026-10-10T11:09:00Z'));
    fireEvent.click(
      screen.getByRole('button', { name: ADMIN_TERMS.servicesRefresh }),
    );
    expect(
      await screen.findByText(ADMIN_TERMS.servicesRefreshFailed),
    ).toBeInTheDocument();
    expect(screen.getByText('1 240')).toBeInTheDocument();
    expect(
      screen.getByText(ADMIN_TERMS.servicesUpdatedAt('10 октября, 14:05:07')),
    ).toBeInTheDocument();
  });

  it('registers as the section root', () => {
    expect(adminOverviewNavItem).toMatchObject({ href: '/admin', order: 0 });
  });
});
