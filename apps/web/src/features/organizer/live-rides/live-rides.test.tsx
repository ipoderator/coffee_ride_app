import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride, RideParticipantSummary } from 'types';
import { confirmFinish, listOwnRides, listRideParticipants } from './api';
import { LiveRidesWidget } from './components/LiveRidesWidget';
import {
  finishTally,
  liveRides,
  overdueRides,
  resolvedCount,
  upcomingRides,
} from './lib/live-rides';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listOwnRides: vi.fn(),
    listRideParticipants: vi.fn(),
    confirmFinish: vi.fn(),
  };
});

const NOW = new Date('2026-10-02T08:00:00Z');

function ride(over: Partial<Ride>): Ride {
  return {
    id: 'r1',
    title: 'Гравийный круг',
    startsAt: '2026-10-02T06:00:00Z',
    startTimezone: 'Europe/Moscow',
    status: 'started',
    distanceKm: 69,
    participantLimit: 20,
    ...over,
  } as Ride;
}

function person(over: Partial<RideParticipantSummary>): RideParticipantSummary {
  return {
    id: 'p1',
    userId: 'u1',
    displayName: 'Алексей Козлов',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: null,
    attendance: null,
    ...over,
  };
}

describe('live-rides lib', () => {
  it('splits live and upcoming rides', () => {
    const rides = [
      ride({ id: 'a' }),
      ride({
        id: 'b',
        status: 'registration_open',
        startsAt: '2026-10-03T07:00:00Z',
      }),
      ride({ id: 'c', status: 'draft', startsAt: '2026-10-04T07:00:00Z' }),
      ride({ id: 'd', status: 'published', startsAt: '2026-10-01T07:00:00Z' }),
    ];
    expect(liveRides(rides).map((r) => r.id)).toEqual(['a']);
    expect(upcomingRides(rides, NOW, 3).map((r) => r.id)).toEqual(['b']);
    // CR-184: a published ride whose start passed is neither — it needs a decision.
    expect(overdueRides(rides, NOW).map((r) => r.id)).toEqual(['d']);
  });

  it('tallies the finish-control states', () => {
    expect(
      finishTally([
        person({ attendance: 'finished' }),
        person({ finishClaimedAt: '2026-10-02T07:00:00Z' }),
        person({}),
        person({ attendance: 'dnf' }),
        person({ attendance: 'no_show' }),
      ]),
    ).toEqual({ confirmed: 1, claimed: 1, onRoute: 1, dnf: 1, noShow: 1 });
    expect(
      resolvedCount({
        confirmed: 2,
        claimed: 1,
        onRoute: 4,
        dnf: 1,
        noShow: 3,
      }),
    ).toBe(6);
  });
});

describe('LiveRidesWidget', () => {
  beforeEach(() => {
    vi.mocked(listOwnRides).mockReset();
    vi.mocked(listRideParticipants).mockReset();
    vi.mocked(confirmFinish).mockReset();
  });

  it('shows a ride under way and confirms a claimed finish', async () => {
    vi.mocked(listOwnRides).mockResolvedValue([
      ride({}),
      ride({
        id: 'n',
        title: 'Кофейный круг',
        status: 'published',
        startsAt: '2099-01-01T07:00:00Z',
      }),
    ]);
    vi.mocked(listRideParticipants).mockResolvedValue([
      person({ finishClaimedAt: '2026-10-02T07:00:00Z' }),
      person({ id: 'p2', displayName: 'Мария Р.', attendance: 'finished' }),
    ]);
    vi.mocked(confirmFinish).mockResolvedValue({ updated: 1 });

    render(<LiveRidesWidget />);

    expect(await screen.findByText('Гравийный круг')).toBeTruthy();
    expect(screen.getByText('Идёт сейчас')).toBeTruthy();
    expect(screen.getByText('Кофейный круг')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(confirmFinish).toHaveBeenCalledWith('r1', 'p1'));
  });

  it('counts every registration in the bar, no-shows included', async () => {
    vi.mocked(listOwnRides).mockResolvedValue([ride({})]);
    vi.mocked(listRideParticipants).mockResolvedValue([
      person({ attendance: 'finished' }),
      person({ id: 'p2', attendance: 'no_show' }),
      person({ id: 'p3' }),
    ]);

    render(<LiveRidesWidget />);

    expect(await screen.findByText('3 участника')).toBeTruthy();
    expect(screen.getByText('В списке')).toBeTruthy();
    expect(screen.queryByText('На старте')).toBeNull();
    expect(screen.getByText('не стартовал')).toBeTruthy();
    expect(screen.getByText('без итога')).toBeTruthy();
    expect(screen.getByText('Итоговый статус у 2 из 3')).toBeTruthy();
    // Three non-empty segments: confirmed, without outcome, no-show.
    expect(
      screen.getByRole('img', { name: '1 из 3 подтверждены' }).children,
    ).toHaveLength(3);
  });

  it('flags a ride whose start passed without being started', async () => {
    vi.mocked(listOwnRides).mockResolvedValue([
      ride({
        id: 'late',
        title: 'Утро на Лосином острове',
        status: 'registration_open',
        startsAt: '2020-10-01T05:00:00Z',
      }),
    ]);

    render(<LiveRidesWidget />);

    expect(await screen.findByText('Требует решения')).toBeTruthy();
    expect(screen.getByText('Утро на Лосином острове')).toBeTruthy();
    expect(screen.getByText(/^Старт был .* заезд не начат$/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Перейти к управлению →' })
        .getAttribute('href'),
    ).toBe('/organizer/rides/late/edit');
    expect(listRideParticipants).not.toHaveBeenCalled();
  });

  it('orders the blocks: under way, needs a decision, coming up (CR-185)', async () => {
    vi.mocked(listOwnRides).mockResolvedValue([
      ride({}),
      ride({
        id: 'late',
        title: 'Утро на Лосином острове',
        status: 'registration_open',
        startsAt: '2020-10-01T05:00:00Z',
      }),
      ride({
        id: 'n',
        title: 'Кофейный круг',
        status: 'published',
        startsAt: '2099-01-01T07:00:00Z',
      }),
    ]);
    vi.mocked(listRideParticipants).mockResolvedValue([]);

    render(<LiveRidesWidget />);

    await screen.findByText('Гравийный круг');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Заезды сейчас', 'Требует решения', 'Ближайшие заезды']);
  });

  it('renders nothing without live or upcoming rides', async () => {
    vi.mocked(listOwnRides).mockResolvedValue([]);
    const { container } = render(<LiveRidesWidget />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
