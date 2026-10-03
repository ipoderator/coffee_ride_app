import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyRegistrationSummary, PublicRide } from 'types';
import { MyRidesView } from './components/MyRidesView';
import { UpcomingRegistrationsWidget } from './components/UpcomingRegistrationsWidget';
import { listMyRegistrations } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listMyRegistrations: vi.fn(),
  };
});

const listMyRegistrationsMock = vi.mocked(listMyRegistrations);

const baseRide: PublicRide = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: 500,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  paceKmh: 24.5,
  durationMinutes: 150,
  difficulty: 3,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
  organizer: {
    id: 'org-1',
    name: 'Гравийный клуб',
    avatarUrl: null,
    rating: null,
    reviewCount: 0,
  },
};

const baseItem: MyRegistrationSummary = {
  registration: {
    id: 'reg-1',
    rideId: 'ride-1',
    userId: 'user-1',
    status: 'active',
    groupId: null,
    createdAt: '2027-01-02T00:00:00.000Z',
    updatedAt: '2027-01-02T00:00:00.000Z',
    cancelledAt: null,
    finishClaimedAt: null,
    attendance: null,
  },
  ride: baseRide,
};

describe('MyRidesView', () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset();
  });

  it('fetches the upcoming tab by default', async () => {
    listMyRegistrationsMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<MyRidesView />);

    await screen.findByText('Нет предстоящих регистраций');
    expect(listMyRegistrationsMock).toHaveBeenLastCalledWith({
      when: 'upcoming',
    });
  });

  it('shows an error state on a network/server failure', async () => {
    listMyRegistrationsMock.mockRejectedValue(new Error('network error'));

    render(<MyRidesView />);

    expect(
      await screen.findByText(
        'Не удалось загрузить регистрации. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a card per registration with the ride title, status, and organizer', async () => {
    listMyRegistrationsMock.mockResolvedValue({
      items: [baseItem],
      nextCursor: null,
    });

    render(<MyRidesView />);

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(screen.getByText('Регистрация открыта')).toBeInTheDocument();
    expect(screen.getByText(/Гравийный клуб/)).toBeInTheDocument();
  });

  it('switches to the history tab and refetches with when=past', async () => {
    listMyRegistrationsMock
      .mockResolvedValueOnce({ items: [baseItem], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    render(<MyRidesView />);
    await screen.findByText(baseRide.title);

    // CR-193: «История», not «Прошедшие» — finished and cancelled rides
    // are here whatever their date.
    fireEvent.click(screen.getByRole('tab', { name: 'История' }));

    await screen.findByText('История пока пуста');
    expect(listMyRegistrationsMock).toHaveBeenLastCalledWith({ when: 'past' });
  });

  it('shows a cancelled ride in history with its «Отменён» badge (CR-193)', async () => {
    const cancelled: MyRegistrationSummary = {
      registration: { ...baseItem.registration, id: 'reg-2', rideId: 'ride-2' },
      ride: {
        ...baseRide,
        id: 'ride-2',
        title: 'Отменённый заезд',
        status: 'cancelled',
      },
    };
    listMyRegistrationsMock.mockImplementation(async ({ when }) => ({
      items: when === 'past' ? [cancelled] : [],
      nextCursor: null,
    }));

    render(<MyRidesView />);
    await screen.findByText('Нет предстоящих регистраций');
    fireEvent.click(screen.getByRole('tab', { name: 'История' }));

    const link = (await screen.findByText('Отменённый заезд')).closest('a');
    expect(link).toHaveAttribute('href', '/rides/ride-2');
    expect(screen.getByText('Отменён')).toBeInTheDocument();
  });

  it('links each card into the ride detail page', async () => {
    listMyRegistrationsMock.mockResolvedValue({
      items: [baseItem],
      nextCursor: null,
    });

    render(<MyRidesView />);

    const link = (await screen.findByText(baseRide.title)).closest('a');
    expect(link).toHaveAttribute('href', '/rides/ride-1');
  });
});

describe('UpcomingRegistrationsWidget (CR-185)', () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset();
  });

  /** Separate answers per tab: `upcoming`, and history (`past`). */
  function respond({
    upcoming = [] as MyRegistrationSummary[],
    past = [] as MyRegistrationSummary[],
  } = {}) {
    listMyRegistrationsMock.mockImplementation(async ({ when }) => ({
      items: when === 'upcoming' ? upcoming : past,
      nextCursor: null,
    }));
  }

  function rideItem(
    id: string,
    ride: Partial<PublicRide>,
  ): MyRegistrationSummary {
    return {
      registration: { ...baseItem.registration, id: `reg-${id}`, rideId: id },
      ride: { ...baseRide, id, ...ride },
    };
  }

  it('lists the next registrations with a link to all of them', async () => {
    respond({ upcoming: [baseItem] });
    render(<UpcomingRegistrationsWidget />);

    expect(
      await screen.findByRole('link', { name: baseRide.title }),
    ).toHaveAttribute('href', '/rides/ride-1');
    expect(screen.getByText('Регистрация открыта')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Все регистрации →' }),
    ).toHaveAttribute('href', '/me/rides');
    expect(listMyRegistrationsMock).toHaveBeenCalledWith({
      when: 'upcoming',
      limit: 3,
    });
    expect(screen.queryByText('Отменены организатором')).toBeNull();
  });

  it('offers «Найти заезд» when nothing is booked', async () => {
    respond();
    render(<UpcomingRegistrationsWidget />);

    expect(
      await screen.findByText('Пока нет предстоящих заездов'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Найти заезд' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('link', { name: 'Все регистрации →' })).toBeNull();
  });

  // CR-193 (owner QA): a cancelled ride is no longer «upcoming», but the
  // participant must still notice it here until its date has passed.
  it('keeps a cancelled ride with a date ahead in sight, apart from the next rides', async () => {
    respond({
      upcoming: [baseItem],
      past: [
        rideItem('ride-cancelled', {
          title: 'Отменён впереди',
          status: 'cancelled',
          startsAt: '2099-05-01T05:00:00.000Z',
        }),
        rideItem('ride-finished', {
          title: 'Завершён впереди',
          status: 'finished',
          startsAt: '2099-04-01T05:00:00.000Z',
        }),
        rideItem('ride-old', {
          title: 'Отменён давно',
          status: 'cancelled',
          startsAt: '2020-01-01T05:00:00.000Z',
        }),
      ],
    });
    render(<UpcomingRegistrationsWidget />);

    expect(
      await screen.findByRole('heading', { name: 'Отменены организатором' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Отменён впереди' }),
    ).toHaveAttribute('href', '/rides/ride-cancelled');
    expect(screen.getByText('Отменён')).toBeInTheDocument();
    expect(screen.queryByText('Завершён впереди')).toBeNull();
    expect(screen.queryByText('Отменён давно')).toBeNull();
    expect(listMyRegistrationsMock).toHaveBeenCalledWith({
      when: 'past',
      limit: 3,
    });
  });

  it('shows the cancellation under the empty state too, with the way to history', async () => {
    respond({
      past: [
        rideItem('ride-cancelled', {
          title: 'Отменён впереди',
          status: 'cancelled',
          startsAt: '2099-05-01T05:00:00.000Z',
        }),
      ],
    });
    render(<UpcomingRegistrationsWidget />);

    expect(
      await screen.findByText('Пока нет предстоящих заездов'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Отменён впереди' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Все регистрации →' }),
    ).toHaveAttribute('href', '/me/rides');
  });

  it('still shows the next rides when reading history fails', async () => {
    listMyRegistrationsMock.mockImplementation(async ({ when }) => {
      if (when === 'past') throw new Error('network');
      return { items: [baseItem], nextCursor: null };
    });
    render(<UpcomingRegistrationsWidget />);

    expect(
      await screen.findByRole('link', { name: baseRide.title }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an error with retry', async () => {
    let failing = true;
    listMyRegistrationsMock.mockImplementation(async ({ when }) => {
      if (when === 'upcoming' && failing) throw new Error('network');
      return { items: [], nextCursor: null };
    });
    render(<UpcomingRegistrationsWidget />);

    const retry = await screen.findByRole('button');
    failing = false;
    fireEvent.click(retry);
    expect(
      await screen.findByText('Пока нет предстоящих заездов'),
    ).toBeInTheDocument();
  });
});
