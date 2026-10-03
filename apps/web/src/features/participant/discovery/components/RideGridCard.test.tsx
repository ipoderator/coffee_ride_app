import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicRideListItem } from 'types';
import { RideGridCard } from './RideGridCard';

function makeRide(
  overrides: Partial<PublicRideListItem> = {},
): PublicRideListItem {
  return {
    id: 'ride-1',
    organizerId: 'org-1',
    title: 'Тестовый заезд на выходные',
    description: null,
    coverImageUrl: null,
    bicycleType: 'gravel',
    startsAt: '2026-10-04T06:00:00.000Z',
    startTimezone: 'Europe/Moscow',
    startLat: null,
    startLng: null,
    participantLimit: 20,
    priceRub: null,
    distanceKm: 69.5,
    elevationGainMeters: 350,
    paceKmh: null,
    durationMinutes: 210,
    difficulty: 3,
    participantsVisible: true,
    status: 'registration_open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: null,
    organizer: {
      id: 'org-1',
      name: 'Тестовый организатор',
      avatarUrl: null,
      rating: null,
      reviewCount: 0,
    },
    registrationsCount: 17,
    startLabel: null,
    startDescription: null,
    routePreview: [
      [55.75, 37.6],
      [55.76, 37.62],
      [55.77, 37.61],
    ],
    groups: [
      { name: 'Группа 1', paceKmh: 25 },
      { name: 'Группа 2', paceKmh: 35 },
    ],
    waitlistCount: 0,
    ...overrides,
  } as PublicRideListItem;
}

describe('RideGridCard (CR-144, compact in CR-153)', () => {
  it('is one link to the ride page with its title as a heading', () => {
    render(<RideGridCard ride={makeRide()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/rides/ride-1');
    expect(
      screen.getByRole('heading', { name: 'Тестовый заезд на выходные' }),
    ).toBeInTheDocument();
  });

  it('shows the headline numbers in one line, the groups count as a tag', () => {
    render(<RideGridCard ride={makeRide()} />);
    expect(screen.getByText('69,5')).toBeInTheDocument();
    expect(screen.getByText('350')).toHaveClass('text-elevation');
    expect(screen.getByText('25–35')).toBeInTheDocument();
    expect(screen.getByText('2 группы')).toHaveClass('rounded-full');
  });

  it('leaves a missing number out rather than showing 0', () => {
    render(
      <RideGridCard
        ride={makeRide({ elevationGainMeters: null, groups: [] })}
      />,
    );
    expect(screen.getByText('69,5')).toBeInTheDocument();
    expect(screen.queryByText('350')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows one line instead of three dashes when no metric is known', () => {
    render(
      <RideGridCard
        ride={makeRide({
          distanceKm: null,
          elevationGainMeters: null,
          groups: [],
        })}
      />,
    );
    expect(screen.getByText('Дистанция и темп не указаны')).toBeInTheDocument();
  });

  it('shows seats taken, seats left and the low-seats chip', () => {
    render(<RideGridCard ride={makeRide()} />);
    expect(screen.getByText('17 из 20')).toBeInTheDocument();
    expect(screen.getByText('Осталось 3 места')).toHaveClass('text-warning');
    expect(screen.getByText('Мало мест')).toBeInTheDocument();
  });

  it('offers the waitlist on a full open ride', () => {
    render(<RideGridCard ride={makeRide({ registrationsCount: 20 })} />);
    expect(screen.getByText('Список ожидания')).toBeInTheDocument();
    expect(screen.getByText('Мест нет')).toBeInTheDocument();
    expect(screen.queryByText('Регистрация открыта')).toBeNull();
  });

  it('names the queue on a full ride (CR-153)', () => {
    render(
      <RideGridCard
        ride={makeRide({ registrationsCount: 20, waitlistCount: 2 })}
      />,
    );
    expect(screen.getByText('Мест нет · 2 в очереди')).toBeInTheDocument();
  });

  it('says registration is closed instead of the seats left (CR-153)', () => {
    render(
      <RideGridCard
        ride={makeRide({
          status: 'registration_closed',
          registrationsCount: 4,
          participantLimit: 10,
        })}
      />,
    );
    expect(screen.getByText('4 из 10')).toBeInTheDocument();
    expect(screen.getByText('Запись закрыта')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).toBeNull();
  });

  it('says there is no limit and draws no bar for an unlimited ride', () => {
    const { container } = render(
      <RideGridCard
        ride={makeRide({ participantLimit: null, registrationsCount: 3 })}
      />,
    );
    expect(screen.getByText('3 участника')).toBeInTheDocument();
    expect(screen.getByText('Без ограничения мест')).toBeInTheDocument();
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });

  it('marks a cancelled ride: red chip, struck title, no seats', () => {
    render(<RideGridCard ride={makeRide({ status: 'cancelled' })} />);
    expect(screen.getByText('Отменён')).toHaveClass('bg-danger');
    expect(
      screen.getByRole('heading', { name: 'Тестовый заезд на выходные' }),
    ).toHaveClass('line-through');
    expect(screen.queryByText(/участник/)).toBeNull();
  });

  // CR-193 (owner QA: a finished card read «Осталось 6 мест»).
  it.each([
    ['finished', 'Завершён'],
    ['started', 'Заезд начался'],
  ] as const)(
    'shows only the status on a %s ride — no seats, no bar',
    (status, label) => {
      const { container } = render(
        <RideGridCard
          ride={makeRide({
            status,
            participantLimit: 10,
            registrationsCount: 4,
          })}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(/Осталось|Мест нет|из 10/)).toBeNull();
      expect(container.querySelector('[style*="width"]')).toBeNull();
    },
  );

  it('says registration is not open yet on a published ride (CR-193)', () => {
    render(
      <RideGridCard
        ride={makeRide({
          status: 'published',
          participantLimit: 10,
          registrationsCount: 0,
        })}
      />,
    );
    expect(screen.getByText('Запись ещё не открыта')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).toBeNull();
  });

  it('drops the cover for a ride without a route and says so (CR-185)', () => {
    const { container } = render(
      <RideGridCard
        ride={makeRide({ routePreview: null, registrationsCount: 5 })}
      />,
    );
    expect(screen.getByText('Маршрут пока не загружен')).toBeInTheDocument();
    expect(container.querySelector('[data-route-missing]')).not.toBeNull();
    expect(container.querySelector('svg polyline')).toBeNull();
    // The status still shows, as text.
    expect(screen.getByText('Регистрация открыта')).toBeInTheDocument();
  });

  it('shows bike type, difficulty word and price as chips', () => {
    render(<RideGridCard ride={makeRide({ priceRub: 1500 })} />);
    const link = screen.getByRole('link');
    expect(within(link).getByText('Гравийный')).toBeInTheDocument();
    expect(within(link).getByText('Средний')).toBeInTheDocument();
    expect(within(link).getByText('1 500 ₽')).toBeInTheDocument();
  });
});
