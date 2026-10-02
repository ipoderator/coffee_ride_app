import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantTable } from './components/ParticipantTable';
import { WaitlistTable } from './components/WaitlistTable';
import {
  ApiError,
  confirmClaimedFinishes,
  getRideGroups,
  getRideParticipants,
  getRideStatus,
  getRideWaitlist,
  setAttendance,
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
    getRideStatus: vi.fn(),
    setAttendance: vi.fn(),
    confirmClaimedFinishes: vi.fn(),
  };
});

const getRideParticipantsMock = vi.mocked(getRideParticipants);
const getRideWaitlistMock = vi.mocked(getRideWaitlist);
const getRideGroupsMock = vi.mocked(getRideGroups);
const getRideStatusMock = vi.mocked(getRideStatus);
const setAttendanceMock = vi.mocked(setAttendance);
const confirmClaimedMock = vi.mocked(confirmClaimedFinishes);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a ride without pace groups (the pre-CR-120 flat list).
  getRideGroupsMock.mockResolvedValue([]);
  getRideStatusMock.mockResolvedValue('registration_open');
});

const first: RideParticipantSummary = {
  id: 'reg-1',
  userId: 'user-1',
  displayName: 'Анна Смирнова',
  createdAt: '2027-01-01T10:00:00.000Z',
  group: null,
  finishClaimedAt: null,
  attendance: null,
};
const second: RideParticipantSummary = {
  id: 'reg-2',
  userId: 'user-2',
  displayName: null,
  createdAt: '2027-01-02T10:00:00.000Z',
  group: null,
  finishClaimedAt: null,
  attendance: null,
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

  it("links each name to the rider's profile card (CR-149)", async () => {
    getRideParticipantsMock.mockResolvedValue({
      items: [first],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    expect(
      await screen.findByRole('link', { name: 'Анна Смирнова' }),
    ).toHaveAttribute('href', '/rides/ride-1/riders/reg-1?from=participants');
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
    // CR-187: only the card's own «Записались» heading, no group headings.
    expect(
      screen.getAllByRole('heading').map((heading) => heading.textContent),
    ).toEqual(['Записались']);
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
          finishClaimedAt: null,
          attendance: null,
        },
      ],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    const headings = await screen.findAllByRole('heading', { level: 4 });
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

describe('ParticipantTable — finish check-in (CR-181)', () => {
  const claimed: RideParticipantSummary = {
    ...first,
    id: 'reg-claimed',
    displayName: 'Заявил Финиш',
    finishClaimedAt: '2027-05-01T09:00:00.000Z',
  };
  const silent: RideParticipantSummary = {
    ...second,
    id: 'reg-silent',
    displayName: 'Молчун',
  };
  const confirmed: RideParticipantSummary = {
    ...first,
    id: 'reg-confirmed',
    displayName: 'Уже Подтверждён',
    finishClaimedAt: '2027-05-01T09:00:00.000Z',
    attendance: 'finished',
  };

  async function renderStarted(items: RideParticipantSummary[]) {
    getRideStatusMock.mockResolvedValue('started');
    getRideParticipantsMock.mockResolvedValue({ items, nextCursor: null });
    render(<ParticipantTable rideId="ride-1" />);
    await screen.findByTestId('attendance-panel');
  }

  it('shows no finish controls before the ride has started', async () => {
    getRideParticipantsMock.mockResolvedValue({
      items: [claimed],
      nextCursor: null,
    });
    render(<ParticipantTable rideId="ride-1" />);

    await screen.findByText('Заявил Финиш');
    expect(screen.queryByTestId('attendance-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Не пришёл' }),
    ).not.toBeInTheDocument();
  });

  it('summarises the ride and counts only undecided claims in the batch button', async () => {
    await renderStarted([claimed, silent, confirmed]);

    const panel = screen.getByTestId('attendance-panel');
    expect(
      within(panel).getByText(
        'Финишировали: 1 · Заявили финиш: 1 · Сошли: 0 · Не пришли: 0',
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', {
        name: 'Подтвердить всех заявивших (1)',
      }),
    ).toBeEnabled();
  });

  it('disables the batch button when nobody is waiting for a decision', async () => {
    await renderStarted([silent, confirmed]);

    expect(
      screen.getByRole('button', { name: 'Подтвердить всех заявивших (0)' }),
    ).toBeDisabled();
  });

  it('confirms every claim in one call and updates the rows', async () => {
    confirmClaimedMock.mockResolvedValue({ updated: 1 });
    await renderStarted([claimed, silent]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Подтвердить всех заявивших (1)' }),
    );

    await waitFor(() =>
      expect(confirmClaimedMock).toHaveBeenCalledWith('ride-1'),
    );
    const claimedRow = screen.getByRole('group', {
      name: 'Финиш: Заявил Финиш',
    });
    expect(
      await within(claimedRow).findByText('Финиш подтверждён'),
    ).toBeInTheDocument();
    // The rider who never claimed is untouched.
    const silentRow = screen.getByRole('group', { name: 'Финиш: Молчун' });
    expect(
      within(silentRow).queryByText('Финиш подтверждён'),
    ).not.toBeInTheDocument();
    expect(setAttendanceMock).not.toHaveBeenCalled();
  });

  it('confirms or marks a single rider, and can undo it', async () => {
    setAttendanceMock.mockResolvedValue({ updated: 1 });
    await renderStarted([silent]);
    const row = () => screen.getByRole('group', { name: 'Финиш: Молчун' });

    fireEvent.click(within(row()).getByRole('button', { name: 'Не пришёл' }));
    await waitFor(() =>
      expect(setAttendanceMock).toHaveBeenLastCalledWith(
        'ride-1',
        ['reg-silent'],
        'no_show',
      ),
    );
    expect(await within(row()).findByText('Не пришёл')).toBeInTheDocument();

    fireEvent.click(within(row()).getByRole('button', { name: 'Вернуть' }));
    await waitFor(() =>
      expect(setAttendanceMock).toHaveBeenLastCalledWith(
        'ride-1',
        ['reg-silent'],
        null,
      ),
    );
    expect(
      await within(row()).findByRole('button', { name: 'Подтвердить' }),
    ).toBeInTheDocument();
  });

  it('re-reads the list instead of guessing when a save fails', async () => {
    setAttendanceMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Participant not found',
        status: 404,
        detail: 'Some of the selected participants are not active.',
        instance: '/v1/rides/ride-1/attendance',
        code: 'participant_not_found',
      }),
    );
    await renderStarted([silent]);
    getRideParticipantsMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() =>
      expect(getRideParticipantsMock).toHaveBeenCalledTimes(1),
    );
    // Nothing was marked locally.
    expect(screen.queryByText('Финиш подтверждён')).not.toBeInTheDocument();
  });

  it('marks a rider as «сошёл» and shows the badge (CR-182)', async () => {
    setAttendanceMock.mockResolvedValue({ updated: 1 });
    await renderStarted([silent]);

    fireEvent.click(screen.getByRole('button', { name: 'Сошёл' }));

    await waitFor(() =>
      expect(setAttendanceMock).toHaveBeenCalledWith(
        'ride-1',
        ['reg-silent'],
        'dnf',
      ),
    );
    const row = screen.getByRole('group', { name: 'Финиш: Молчун' });
    expect(await within(row).findByText('Сошёл')).toBeInTheDocument();
    expect(screen.getByText(/Сошли: 1/)).toBeInTheDocument();
  });
});
