import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantTable } from './components/ParticipantTable';
import { WaitlistTable } from './components/WaitlistTable';
import {
  ApiError,
  getRideGroups,
  getRideParticipants,
  getRideWaitlist,
  type RideGroupSummary,
  type RideParticipantSummary,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideParticipants: vi.fn(),
    getRideWaitlist: vi.fn(),
    getRideGroups: vi.fn(),
  };
});

const getRideParticipantsMock = vi.mocked(getRideParticipants);
const getRideWaitlistMock = vi.mocked(getRideWaitlist);
const getRideGroupsMock = vi.mocked(getRideGroups);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a ride without pace groups (the pre-CR-120 flat list).
  getRideGroupsMock.mockResolvedValue([]);
});

const first: RideParticipantSummary = {
  id: 'reg-1',
  userId: 'user-1',
  displayName: 'Анна Смирнова',
  createdAt: '2027-01-01T10:00:00.000Z',
  group: null,
};
const second: RideParticipantSummary = {
  id: 'reg-2',
  userId: 'user-2',
  displayName: null,
  createdAt: '2027-01-02T10:00:00.000Z',
  group: null,
};

describe('ParticipantTable', () => {
  it('shows a loading skeleton, then the participant list', async () => {
    getRideParticipantsMock.mockResolvedValue({
      items: [first, second],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText('Анна Смирнова')).toBeInTheDocument(),
    );
    // A participant with no `displayName` falls back to placeholder text, not a
    // blank cell.
    expect(screen.getByText('Без имени')).toBeInTheDocument();
  });

  it('shows the empty state when no one has registered', async () => {
    getRideParticipantsMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(
        screen.getByText('Пока никто не зарегистрирован'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an error state when the request fails', async () => {
    getRideParticipantsMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists.',
        instance: '/v1/rides/ride-1/participants',
        code: 'ride_not_found',
      }),
    );

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Не удалось загрузить список участников. Попробуйте ещё раз.',
        ),
      ).toBeInTheDocument(),
    );
  });
});

// CR-120: pace groups on the organizer participants page. Pace units are
// NBSP-joined by the shared formatter (`docs/design.md` §7).
const NBSP = '\u00a0';
const slowGroup: RideGroupSummary = {
  id: 'g-1',
  name: 'Группа 1',
  paceKmh: 25,
  description: null,
  position: 0,
  registrationsCount: 2,
};
const fastGroup: RideGroupSummary = {
  id: 'g-2',
  name: 'Группа 2',
  paceKmh: 32.5,
  description: null,
  position: 1,
  registrationsCount: 0,
};
const slowRef = { id: 'g-1', name: 'Группа 1', paceKmh: 25 };

describe('ParticipantTable — pace groups', () => {
  it('keeps the flat list (no group headings) for a ride without groups', async () => {
    getRideParticipantsMock.mockResolvedValue({
      items: [first, second],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    await screen.findByText('Анна Смирнова');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('Без группы')).not.toBeInTheDocument();
  });

  it('groups participants under headings in group order, with counts', async () => {
    getRideGroupsMock.mockResolvedValue([slowGroup, fastGroup]);
    getRideParticipantsMock.mockResolvedValue({
      items: [
        { ...first, group: slowRef },
        {
          ...second,
          displayName: 'Борис',
          group: slowRef,
        },
        {
          id: 'reg-3',
          userId: 'user-3',
          displayName: 'Вера',
          createdAt: '2027-01-03T10:00:00.000Z',
          group: null,
        },
      ],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      `Группа 1 · 25${NBSP}км/ч`,
      `Группа 2 · 32,5${NBSP}км/ч`,
      'Без группы',
    ]);

    const slow = screen.getByRole('region', {
      name: `Группа 1 · 25${NBSP}км/ч`,
    });
    expect(slow).toHaveTextContent('2 участника');
    expect(within(slow).getByText('Анна Смирнова')).toBeInTheDocument();
    expect(within(slow).getByText('Борис')).toBeInTheDocument();

    const fast = screen.getByRole('region', {
      name: `Группа 2 · 32,5${NBSP}км/ч`,
    });
    expect(fast).toHaveTextContent('0 участников');

    const none = screen.getByRole('region', { name: 'Без группы' });
    expect(none).toHaveTextContent('1 участник');
    expect(within(none).getByText('Вера')).toBeInTheDocument();
  });

  it("still groups by the items' own group when the ride's groups can't load", async () => {
    getRideGroupsMock.mockRejectedValue(new Error('network'));
    getRideParticipantsMock.mockResolvedValue({
      items: [{ ...first, group: slowRef }],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    expect(
      await screen.findByRole('heading', { name: `Группа 1 · 25${NBSP}км/ч` }),
    ).toBeInTheDocument();
    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument();
  });
});

describe('WaitlistTable', () => {
  it('renders waiting entries in queue order with a position number', async () => {
    getRideWaitlistMock.mockResolvedValue({
      items: [first, second],
      nextCursor: null,
    });

    render(<WaitlistTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText(/1\.\s*Анна Смирнова/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/2\.\s*Без имени/)).toBeInTheDocument();
  });

  it('shows the empty state when the waitlist is empty', async () => {
    getRideWaitlistMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<WaitlistTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText('Лист ожидания пуст')).toBeInTheDocument(),
    );
  });

  it("shows each entry's group («—» without one) when the ride has groups", async () => {
    getRideGroupsMock.mockResolvedValue([slowGroup, fastGroup]);
    getRideWaitlistMock.mockResolvedValue({
      items: [{ ...first, group: slowRef }, second],
      nextCursor: null,
    });

    render(<WaitlistTable rideId="ride-1" />);

    const items = await screen.findAllByRole('listitem');
    // `toHaveTextContent` collapses whitespace, NBSP included.
    expect(items[0]).toHaveTextContent('Группа: Группа 1 · 25 км/ч');
    expect(items[1]).toHaveTextContent('Группа: —');
  });

  it('shows no group field for a ride without groups', async () => {
    getRideWaitlistMock.mockResolvedValue({
      items: [first],
      nextCursor: null,
    });

    render(<WaitlistTable rideId="ride-1" />);

    await screen.findByText(/Анна Смирнова/);
    expect(screen.queryByText(/Группа:/)).not.toBeInTheDocument();
  });
});

describe('getRideGroups', () => {
  // Regression (CR-120 visual check): `groups` is a sibling of `ride` in
  // `GET /v1/rides/:id`, not a field inside it — reading `ride.groups` silently
  // returned `[]` and hid every group nobody had joined yet.
  it('reads the top-level `groups` of the ride response', async () => {
    const actual = await vi.importActual<typeof import('./api')>('./api');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ride: { id: 'ride-1' },
          groups: [slowGroup, fastGroup],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(actual.getRideGroups('ride-1')).resolves.toEqual([
        slowGroup,
        fastGroup,
      ]);
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/rides/ride-1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
