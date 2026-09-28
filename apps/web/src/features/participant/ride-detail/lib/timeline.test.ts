import { describe, expect, it } from 'vitest';
import type { RoutePoint, Stop } from 'types';
import { buildRouteTrack } from './route-track';
import { buildTimeline } from './timeline';

const AUDIT = {
  rideId: 'ride-1',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  updatedBy: null,
};

function point(
  id: string,
  type: RoutePoint['type'],
  lat: number,
  extra: Partial<RoutePoint> = {},
): RoutePoint {
  return {
    ...AUDIT,
    id,
    type,
    label: null,
    description: null,
    lat,
    lng: 37.6,
    ...extra,
  };
}

function stop(id: string, name: string, lat: number, position: number): Stop {
  return {
    ...AUDIT,
    id,
    name,
    description: null,
    lat,
    lng: 37.6,
    durationMinutes: 30,
    position,
  };
}

// ~4 km north along one meridian, 0.5 km per vertex.
const TRACK = buildRouteTrack(
  Array.from({ length: 9 }, (_, i) => ({
    lat: 55.75 + i * 0.0045,
    lng: 37.6,
    elevationMeters: 100,
  })),
)!;

describe('buildTimeline (CR-151)', () => {
  it('orders items along the track with their km, start and finish at the ends', () => {
    const items = buildTimeline({
      routePoints: [
        point('water', 'water', 55.75 + 6 * 0.0045),
        point('start', 'start', 55.75, { description: 'Кофейня «Зерно».' }),
      ],
      stops: [stop('coffee', 'Кофе-стоп', 55.75 + 2 * 0.0045, 1)],
      track: TRACK,
      rideStart: null,
      startTime: '07:30',
      finishTime: '12:00',
    });

    expect(items.map((item) => item.id)).toEqual([
      'start',
      'coffee',
      'water',
      'route-finish',
    ]);
    expect(items[0]).toMatchObject({
      title: 'Старт · 07:30',
      subtitle: 'Кофейня «Зерно»',
      km: 0,
    });
    expect(items[1]!.km).toBeCloseTo(1, 1);
    expect(items[1]!.subtitle).toBe('стоянка 30\u00a0мин');
    expect(items[2]).toMatchObject({ title: 'Вода', subtitle: null });
    expect(items[3]).toMatchObject({ title: 'Финиш · ≈ 12:00' });
    expect(items[3]!.km).toBe(TRACK.totalKm);
  });

  it('without a track keeps start → stops → points → finish and no km', () => {
    const items = buildTimeline({
      routePoints: [
        point('finish', 'finish', 55.8, { label: 'Финиш' }),
        point('danger', 'danger', 55.79, {
          label: 'Спуск',
          description: 'Гравий',
        }),
      ],
      stops: [stop('coffee', 'Кофе', 55.77, 1)],
      track: null,
      rideStart: { lat: 55.75, lng: 37.6 },
      startTime: '19:00',
      finishTime: null,
    });

    expect(items.map((item) => item.id)).toEqual([
      'ride-start',
      'coffee',
      'danger',
      'finish',
    ]);
    expect(items.every((item) => item.km === null)).toBe(true);
    expect(items[2]).toMatchObject({
      title: 'Спуск',
      subtitle: 'Опасный участок · Гравий',
    });
    // A label that only repeats the type adds nothing; no duration → no «≈».
    expect(items[3]).toMatchObject({ title: 'Финиш', subtitle: null });
  });

  it('is empty for a ride with nothing to place', () => {
    expect(
      buildTimeline({
        routePoints: [],
        stops: [],
        track: null,
        rideStart: null,
        startTime: '07:30',
        finishTime: null,
      }),
    ).toEqual([]);
  });
});
