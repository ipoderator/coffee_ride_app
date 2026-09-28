import type { LatLng } from 'maps-core';
import type { RoutePoint, Stop } from 'types';
import {
  formatDuration,
  formatStartPlace,
  RIDE_POSTER_TERMS,
  ROUTE_POINT_TYPE_TERMS,
} from 'ui';
import type { MarkKind } from './route-point-colors';
import { distanceAlongRoute, type RouteTrack } from './route-track';

export interface TimelineItem {
  id: string;
  kind: MarkKind;
  title: string;
  subtitle: string | null;
  /** Distance from the start, when there is a track to measure along. */
  km: number | null;
  point: LatLng | null;
}

/** A label that only repeats the point's type («Финиш») says nothing new. */
function ownLabel(point: RoutePoint): string | null {
  const label = point.label?.trim();
  if (!label) return null;
  return label.toLowerCase() ===
    ROUTE_POINT_TYPE_TERMS[point.type].toLowerCase()
    ? null
    : label;
}

function joinParts(parts: Array<string | null | undefined>): string | null {
  const text = parts.filter((part) => part && part.trim()).join(' · ');
  return text || null;
}

/**
 * CR-151: «Маршрут по точкам» — the ride's start, its typed route points and
 * named stops, and the finish, as one ordered list. With a track each item is
 * placed at its km along it and the list follows the route; without one the
 * order is start → stops (their own order) → other points → finish, with no
 * km column. The start carries the start time; the finish an estimate
 * (start + the organizer's duration) when there is one.
 */
export function buildTimeline({
  routePoints,
  stops,
  track,
  rideStart,
  startTime,
  finishTime,
}: {
  routePoints: RoutePoint[];
  stops: Stop[];
  track: RouteTrack | null;
  /** `Ride.startLat`/`startLng`, pinned when no `start` route point exists. */
  rideStart: LatLng | null;
  /** «07:30». */
  startTime: string;
  /** «≈ 12:00» source — `null` without a duration. */
  finishTime: string | null;
}): TimelineItem[] {
  const measure = (point: LatLng, kind: 'start' | 'finish' | 'other') =>
    track ? distanceAlongRoute(track, point, kind) : null;

  const startPoint = routePoints.find((point) => point.type === 'start');
  const finishPoint = routePoints.find((point) => point.type === 'finish');

  const start: TimelineItem | null = startPoint
    ? {
        id: startPoint.id,
        kind: 'start',
        title: RIDE_POSTER_TERMS.startAt(startTime),
        subtitle: formatStartPlace(startPoint.label, startPoint.description),
        km: track ? 0 : null,
        point: startPoint,
      }
    : rideStart || track
      ? {
          id: 'ride-start',
          kind: 'ride-start',
          title: RIDE_POSTER_TERMS.startAt(startTime),
          subtitle: null,
          km: track ? 0 : null,
          point: rideStart,
        }
      : null;

  const finishTitle = finishTime
    ? RIDE_POSTER_TERMS.finishAt(finishTime)
    : ROUTE_POINT_TYPE_TERMS.finish;
  const finish: TimelineItem | null = finishPoint
    ? {
        id: finishPoint.id,
        kind: 'finish',
        title: finishTitle,
        subtitle: joinParts([ownLabel(finishPoint), finishPoint.description]),
        km: track ? track.totalKm : null,
        point: finishPoint,
      }
    : track
      ? {
          id: 'route-finish',
          kind: 'finish',
          title: finishTitle,
          subtitle: null,
          km: track.totalKm,
          point: null,
        }
      : null;

  const stopItems: TimelineItem[] = stops.map((stop) => ({
    id: stop.id,
    kind: 'named-stop',
    title: stop.name,
    subtitle: joinParts([
      stop.description,
      stop.durationMinutes !== null
        ? RIDE_POSTER_TERMS.stopFor(formatDuration(stop.durationMinutes))
        : null,
    ]),
    km: measure(stop, 'other'),
    point: stop,
  }));

  const pointItems: TimelineItem[] = routePoints
    .filter((point) => point.type !== 'start' && point.type !== 'finish')
    .map((point) => {
      const label = ownLabel(point);
      return {
        id: point.id,
        kind: point.type,
        title: label ?? ROUTE_POINT_TYPE_TERMS[point.type],
        subtitle: joinParts([
          label ? ROUTE_POINT_TYPE_TERMS[point.type] : null,
          point.description,
        ]),
        km: measure(point, 'other'),
        point,
      };
    });

  let middle = [...stopItems, ...pointItems];
  if (track) {
    // Stable sort keeps stops before points at the same km.
    middle = middle.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  }

  return [...(start ? [start] : []), ...middle, ...(finish ? [finish] : [])];
}
