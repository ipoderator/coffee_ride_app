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
    routePreview: [
      [55.75, 37.6],
      [55.76, 37.62],
      [55.77, 37.61],
    ],
    groups: [
      { name: 'Группа 1', paceKmh: 25 },
      { name: 'Группа 2', paceKmh: 35 },
    ],
    ...overrides,
  } as PublicRideListItem;
}

describe('RideGridCard (CR-144)', () => {
  it('is one link to the ride page with its title as a heading', () => {
    render(<RideGridCard ride={makeRide()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/rides/ride-1');
    expect(
      screen.getByRole('heading', { name: 'Тестовый заезд на выходные' }),
    ).toBeInTheDocument();
  });

  it('labels each metric, with the groups count under the pace', () => {
    render(<RideGridCard ride={makeRide()} />);
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Дистанция', 'Набор высоты', 'Средний темп']);
    expect(screen.getByText('69,5')).toBeInTheDocument();
    expect(screen.getByText('350')).toHaveClass('text-elevation');
    expect(screen.getByText('25–35')).toBeInTheDocument();
    expect(screen.getByText('2 группы')).toBeInTheDocument();
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
    expect(screen.queryByRole('term')).toBeNull();
    expect(screen.getByText('Дистанция и темп не указаны')).toBeInTheDocument();
  });

  it('shows seats taken, seats left and the low-seats chip', () => {
    render(<RideGridCard ride={makeRide()} />);
    expect(screen.getByText('17 из 20 участников')).toBeInTheDocument();
    expect(screen.getByText('Осталось 3 места')).toHaveClass('text-warning');
    expect(screen.getByText('Мало мест')).toBeInTheDocument();
  });

  it('offers the waitlist on a full open ride', () => {
    render(<RideGridCard ride={makeRide({ registrationsCount: 20 })} />);
    expect(screen.getByText('Список ожидания')).toBeInTheDocument();
    expect(screen.getByText('Мест нет')).toBeInTheDocument();
    expect(screen.queryByText('Регистрация открыта')).toBeNull();
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

  it('says the route is missing on the cover when there is none', () => {
    render(<RideGridCard ride={makeRide({ routePreview: null })} />);
    expect(screen.getByText('Маршрут пока не загружен')).toBeInTheDocument();
  });

  it('shows bike type, difficulty word and price as chips', () => {
    render(<RideGridCard ride={makeRide({ priceRub: 1500 })} />);
    const link = screen.getByRole('link');
    expect(within(link).getByText('Гравийный')).toBeInTheDocument();
    expect(within(link).getByText('Средний')).toBeInTheDocument();
    expect(within(link).getByText('1 500 ₽')).toBeInTheDocument();
  });
});
