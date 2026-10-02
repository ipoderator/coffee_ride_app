import { describe, expect, it } from 'vitest';
import type { Ride, RideStatus } from 'types';
import { ORGANIZER_RIDE_READINESS } from './organizer-ride-readiness';
import type { RideWorkspaceData } from './ride-workspace';

const NBSP = ' ';

const ride: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утро',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2099-10-04T06:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 15,
  priceRub: null,
  distanceKm: null,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

function data(
  status: RideStatus,
  extra: Partial<RideWorkspaceData> = {},
): RideWorkspaceData {
  return {
    ride: { ...ride, status },
    route: null,
    stops: [],
    routePoints: [],
    groups: [],
    registrationsCount: 0,
    waitlistCount: 0,
    attendanceSummary: null,
    requirements: [],
    latestUpdate: null,
    ...extra,
  };
}

const route = {
  id: 'route-1',
  rideId: 'ride-1',
  gpxFileName: 'loop.gpx',
  gpxFileSizeBytes: 1000,
  distanceKm: 42,
  elevationGainMeters: 380,
  pointCount: 1200,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const {
  route: routeOf,
  cover,
  groups,
  participants,
  updates,
} = ORGANIZER_RIDE_READINESS as Required<typeof ORGANIZER_RIDE_READINESS>;

describe('ride section readiness (CR-187)', () => {
  it('route: a draft without a track asks for one; a published one says it is fixed', () => {
    expect(routeOf!(data('draft'))).toMatchObject({
      tone: 'warning',
      title: 'Маршрута пока нет',
      action: 'Добавить',
    });
    expect(routeOf!(data('published'))).toMatchObject({
      tone: 'neutral',
      title: 'Без трека',
      action: 'Посмотреть',
    });
  });

  it('route: a track reads as its own figures and stop count', () => {
    expect(
      routeOf!(data('registration_open', { route, stops: [{} as never] })),
    ).toMatchObject({
      tone: 'success',
      chip: 'Трек загружен',
      detail: `42,0${NBSP}км · 380${NBSP}м набора · 1 остановка`,
    });
  });

  it('cover: no link on a published ride without a cover', () => {
    expect(cover!(data('published'))).toMatchObject({
      title: 'Без обложки',
      action: null,
    });
    expect(cover!(data('draft'))).toMatchObject({ action: 'Загрузить' });
  });

  it('groups: names and paces; read-only once finished', () => {
    const withGroups = data('finished', {
      groups: [
        {
          id: 'g1',
          name: 'Лайт',
          paceKmh: 18,
          description: null,
          position: 0,
          registrationsCount: 2,
        },
        {
          id: 'g2',
          name: 'Темп',
          paceKmh: 27.5,
          description: null,
          position: 1,
          registrationsCount: 3,
        },
      ],
    });
    expect(groups!(withGroups)).toMatchObject({
      title: '2 группы по темпу',
      detail: `Лайт 18${NBSP}км/ч · Темп 27,5${NBSP}км/ч`,
      chip: '2 из 6',
      action: 'Посмотреть',
    });
    expect(groups!(data('cancelled'))).toMatchObject({ action: null });
    expect(groups!(data('registration_open'))).toMatchObject({
      action: 'Добавить',
    });
  });

  it('participants: no row for a draft; seats and waitlist while open', () => {
    expect(participants!(data('draft'))).toBeNull();
    expect(
      participants!(
        data('registration_open', { registrationsCount: 5, waitlistCount: 2 }),
      ),
    ).toMatchObject({
      title: '5 участников записались',
      detail: 'Свободно 10 из 15 · лист ожидания: 2',
      chip: '5 записались',
    });
  });

  it('participants: undecided riders after the start and at the finish', () => {
    expect(
      participants!(
        data('started', {
          registrationsCount: 4,
          attendanceSummary: { finished: 1, dnf: 0, noShow: 1, unresolved: 2 },
        }),
      ),
    ).toMatchObject({
      tone: 'warning',
      detail: 'Итоговый статус у 2 из 4',
      chip: 'Не отмечено: 2',
      action: 'Отметить',
    });
    expect(
      participants!(
        data('finished', {
          registrationsCount: 4,
          attendanceSummary: { finished: 3, dnf: 1, noShow: 0, unresolved: 0 },
        }),
      ),
    ).toMatchObject({
      tone: 'success',
      detail: 'Финиш: 3 · сошли: 1 · не пришли: 0',
      chip: 'Итоги подведены',
    });
  });

  it('participants: every other phase has its own concrete line (KI-085)', () => {
    expect(participants!(data('published'))).toMatchObject({
      chip: 'Запись не открыта',
      action: null,
    });
    expect(
      participants!(
        data('registration_closed', {
          ride: {
            ...ride,
            status: 'registration_closed',
            participantLimit: null,
          },
        }),
      ),
    ).toMatchObject({
      tone: 'neutral',
      title: 'Пока никто не записался',
      detail: 'Без ограничения мест · лист ожидания: 0',
      chip: 'Никто не записан',
    });
    expect(participants!(data('started'))).toMatchObject({
      title: 'Пока никто не записался',
      action: null,
    });
    // No summary yet: everyone counts as undecided, never as «all marked».
    expect(
      participants!(data('started', { registrationsCount: 3 })),
    ).toMatchObject({ tone: 'warning', chip: 'Не отмечено: 3' });
    expect(
      participants!(
        data('started', {
          registrationsCount: 2,
          attendanceSummary: { finished: 2, dnf: 0, noShow: 0, unresolved: 0 },
        }),
      ),
    ).toMatchObject({ tone: 'success', chip: 'Все отмечены' });
    expect(participants!(data('finished'))).toMatchObject({
      title: 'Итоги заезда',
      action: null,
    });
    expect(
      participants!(data('finished', { registrationsCount: 2 })),
    ).toMatchObject({ action: 'Открыть' });
    expect(
      participants!(
        data('finished', {
          registrationsCount: 4,
          attendanceSummary: { finished: 2, dnf: 0, noShow: 0, unresolved: 2 },
        }),
      ),
    ).toMatchObject({ tone: 'warning', chip: 'Не подтверждено: 2' });
    expect(participants!(data('cancelled'))).toMatchObject({
      title: 'Заезд отменён',
      action: null,
    });
    expect(
      participants!(data('cancelled', { registrationsCount: 1 })),
    ).toMatchObject({ chip: '1 записался', action: 'Открыть' });
  });

  it('updates: no row for a draft; the last message in the ride timezone', () => {
    expect(updates!(data('draft'))).toBeNull();
    expect(
      updates!(data('published', { latestUpdate: undefined })),
    ).toMatchObject({ chip: 'История недоступна' });
    expect(
      updates!(
        data('registration_open', {
          latestUpdate: {
            id: 'u1',
            rideId: 'ride-1',
            message: 'Встречаемся у северного входа',
            createdAt: '2099-10-02T15:40:00.000Z',
          },
        }),
      ),
    ).toMatchObject({
      title: 'Последнее обновление',
      detail: '2 октября 2099, 18:40 · «Встречаемся у северного входа»',
    });
  });
});
