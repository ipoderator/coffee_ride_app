'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, MapHandle, MapMarkerInput } from 'maps-core';
import type { PublicRideListItem } from 'types';
import {
  DIFFICULTY_LEVEL_TERMS,
  RIDE_DISCOVERY_ROW_TERMS,
  cn,
  formatElevation,
  formatTime,
} from 'ui';
import { createMapRenderer } from '@/lib/maps/create-map-renderer';
import { getCssColorVar } from '@/lib/maps/css-color';
import { prefersReducedMotion } from '@/lib/motion/reduced-motion';
import { getRouteGeometry } from '../api';
import {
  lineMidpoint,
  lineSummit,
  type ElevatedPoint,
} from '../lib/route-highlights';
import { smoothRoutePreview } from '../lib/route-preview';
import { BasemapUnavailableNotice } from './BasemapUnavailableNotice';
import { RideMapPlaceholder } from './RideMapPlaceholder';

// A ride with no start location can't get a pin — same "missing data" stance
// the rest of the app takes (`docs/design.md` §6/§7: absent, never a fake 0).
type PlottableRide = PublicRideListItem & {
  startLat: number;
  startLng: number;
};

function isPlottable(ride: PublicRideListItem): ride is PlottableRide {
  return ride.startLat !== null && ride.startLng !== null;
}

// Moscow — a reasonable default center when no ride has a start location yet
// (an empty/loading result, or every ride missing coordinates). Not a design
// decision about the platform's home city, just a non-empty fallback so the
// map has somewhere to point before any pin exists.
const DEFAULT_CENTER = { lat: 55.7558, lng: 37.6173 };
const FIT_OPTIONS = { padding: 64, maxZoom: 12 };
// Route line: 5px of overprint inside a 2px paper casing each side (the
// adapter adds 4px for `outlineColor`) — enough weight to read over roads
// without turning into a band.
const ROUTE_LINE_WIDTH = 5;
const GEOMETRY_FETCH_DELAY_MS = 120;
// CR-170/171: the camera move to a selected ride — long enough to read as a
// move, short enough not to delay the next click.
const FOCUS_MOVE_MS = 600;
// CR-171: framing a selected route — room above the line for its notes
// (pills sit ~30px over their point), never closer than street level.
const ROUTE_FIT_OPTIONS = { padding: 56, maxZoom: 14 };
// CR-171: the active route draws itself in over this long — a soft stroke,
// not a wait (the line is usable throughout).
const ROUTE_DRAW_MS = 900;

/**
 * Bumps whenever the theme class on `<html>` changes (CR-110's theme control),
 * so map colours — resolved from CSS custom properties at call time, since the
 * map draws outside Tailwind's reach (`docs/design.md` §14) — are re-applied
 * in the new theme instead of keeping the old one until the next data change.
 */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setVersion((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return version;
}

/**
 * `/`'s map (CR-098/ADR-020, rebuilt for «Топокарта» by CR-118). Falls back to
 * `RideMapPlaceholder` (`docs/design.md` §10's degraded state) whenever no key
 * is configured or the render fails — the list next to it stays fully usable.
 *
 * CR-118 fixes the "markers never follow the filter" bug: the map is created
 * once, and separate effects keep it in sync with the data —
 * - start pins (orienteering rings captioned with the ride's local start
 *   time) follow `rides` and `activeId`;
 * - the camera re-frames every start point only when the set of plottable
 *   rides changes, never on a hover;
 * - the active ride's `routePreview` is drawn as the route line.
 * A pin click reports the ride id (`onSelect`); the list decides what that
 * means (scroll the row into view, or raise it on a phone).
 *
 * CR-170/171: `focusId` — the *selected* ride (a pin click or a focused row,
 * never a hover) — eases the camera to frame its whole route (or, without a
 * route, to its start); under reduced motion it jumps.
 *
 * CR-171, the map as the emotional layer: the active ride's route draws
 * itself in, its start ring pulses a few times, and two quiet notes sit on
 * the line (difficulty halfway, the summit once elevation is known), fading
 * in as the line reaches them. Reduced motion: all of it shown at once.
 *
 * CR-185 (UX handoff P2): a map that was created but whose basemap never
 * drew (`MapRenderOptions.onBasemapUnavailable` — tiles refused or
 * unreachable, the style failed) gets a «Карта недоступна» notice over the
 * map area with «Повторить», which re-creates the map in place — the
 * filters and the list (the parent's state and URL) are untouched. A render
 * that fails outright gets the same notice; only a missing key keeps the
 * plain placeholder (retrying can't help there).
 */
export function DiscoveryMap({
  rides,
  activeId,
  focusId = null,
  onSelect,
  className,
}: {
  rides: PublicRideListItem[];
  activeId: string | null;
  focusId?: string | null;
  onSelect: (rideId: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [basemapUnavailable, setBasemapUnavailable] = useState(false);
  // CR-185: bumping this re-creates the map («Повторить»).
  const [attempt, setAttempt] = useState(0);
  const noKey = useMemo(() => createMapRenderer() === null, []);
  const themeVersion = useThemeVersion();

  // The render options are fixed at map creation; route the click through a
  // ref so it always calls the parent's current handler.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const plottable = useMemo(() => rides.filter(isPlottable), [rides]);
  // A stable identity for "which pins exist where" — the fit effect keys on
  // this, not on the `rides` array (a refetch returns a new array even when
  // nothing moved).
  const plottableKey = plottable
    .map((ride) => `${ride.id}@${ride.startLat},${ride.startLng}`)
    .join('|');

  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) return;

    let cancelled = false;
    let rendered: MapHandle | undefined;
    setRenderFailed(false);
    setBasemapUnavailable(false);

    renderer
      .render({
        container: containerRef.current,
        center: DEFAULT_CENTER,
        zoom: 9,
        onMarkerClick: (id) => onSelectRef.current(id),
        onBasemapUnavailable: () => {
          if (!cancelled) setBasemapUnavailable(true);
        },
      })
      .then((renderedHandle) => {
        if (cancelled) {
          renderedHandle.destroy();
          return;
        }
        rendered = renderedHandle;
        setHandle(renderedHandle);
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });

    return () => {
      cancelled = true;
      rendered?.destroy();
      setHandle(null);
    };
  }, [attempt]);

  // Camera: frame every start point when the set of pins changes.
  useEffect(() => {
    if (!handle || plottable.length === 0) return;
    const points: LatLng[] = plottable.map((ride) => ({
      lat: ride.startLat,
      lng: ride.startLng,
    }));
    handle.fitBounds(points, FIT_OPTIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, plottableKey]);

  // Route line. The list only carries `routePreview` (≤ 40 points, CR-116) —
  // fine for the row glyph, but at map scale it's a chain of straight sticks
  // cutting across the road network. So the active ride's full stored line is
  // fetched (once per ride, cached) and drawn instead; until it arrives, or if
  // the request fails, the preview is drawn smoothed rather than nothing.
  const activeRoute = useMemo(
    () => rides.find((ride) => ride.id === activeId)?.routePreview ?? null,
    [rides, activeId],
  );
  const geometryCache = useRef(new Map<string, ElevatedPoint[]>());
  const [fullRoute, setFullRoute] = useState<{
    rideId: string;
    points: ElevatedPoint[];
  } | null>(null);
  useEffect(() => {
    if (!activeId || !activeRoute) return;
    const cached = geometryCache.current.get(activeId);
    if (cached) {
      setFullRoute({ rideId: activeId, points: cached });
      return;
    }
    let cancelled = false;
    // A short delay so sweeping the pointer down the list doesn't fire a
    // request per row it crosses.
    const timer = setTimeout(() => {
      getRouteGeometry(activeId)
        .then(({ points }) => {
          // Elevation kept (CR-171): the summit note needs it.
          const line = points.map(({ lat, lng, elevationMeters }) => ({
            lat,
            lng,
            elevationMeters,
          }));
          geometryCache.current.set(activeId, line);
          if (!cancelled) setFullRoute({ rideId: activeId, points: line });
        })
        // Degraded, not broken: the smoothed preview stays on the map.
        .catch(() => {});
    }, GEOMETRY_FETCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeId, activeRoute]);

  // The line on the map: the full stored geometry once it is here, else the
  // smoothed preview (which has no elevation).
  const linePoints = useMemo<ElevatedPoint[] | null>(() => {
    if (!activeRoute || activeRoute.length < 2) return null;
    if (
      fullRoute &&
      fullRoute.rideId === activeId &&
      fullRoute.points.length >= 2
    ) {
      return fullRoute.points;
    }
    return smoothRoutePreview(activeRoute).map(([lat, lng]) => ({
      lat,
      lng,
      elevationMeters: null,
    }));
  }, [activeRoute, activeId, fullRoute]);

  // CR-171: the draw-in of the active ride's line. A new active ride starts a
  // draw; anything else (the full geometry replacing the preview, a theme
  // switch) updates the line and lets a running draw carry on.
  const drawRef = useRef<{
    rideId: string;
    startedAt: number;
    animated: boolean;
  } | null>(null);
  // Per tag id, the reveal delay it was first given — stable, so a later
  // marker update never re-fades a tag that is already showing.
  const revealDelays = useRef(new Map<string, number>());

  useEffect(() => {
    if (!handle) return;
    if (!activeId || !linePoints) {
      drawRef.current = null;
      handle.setPolyline(null);
      return;
    }
    const fresh = drawRef.current?.rideId !== activeId;
    if (fresh) {
      drawRef.current = {
        rideId: activeId,
        startedAt: performance.now(),
        animated: !prefersReducedMotion(),
      };
      revealDelays.current = new Map();
    }
    handle.setPolyline({
      points: linePoints.map(({ lat, lng }) => ({ lat, lng })),
      color: getCssColorVar('--map-route'),
      width: ROUTE_LINE_WIDTH,
      outlineColor: getCssColorVar('--map-route-casing'),
      ...(fresh && drawRef.current!.animated
        ? { drawInMs: ROUTE_DRAW_MS }
        : {}),
    });
  }, [handle, activeId, linePoints, themeVersion]);

  // Pins (start rings) plus, for the active ride, the notes on its line.
  // Declared after the line effect: it reads the draw that effect started.
  useEffect(() => {
    if (!handle) return;
    // `--map-*`: basemap-bound inks, identical in both themes (KI-057).
    const route = getCssColorVar('--map-route');
    const primary = getCssColorVar('--map-marker-selected');
    const halo = getCssColorVar('--map-route-casing');
    const draw = drawRef.current?.rideId === activeId ? drawRef.current : null;
    const markers: MapMarkerInput[] = plottable.map((ride) => {
      const selected = ride.id === activeId;
      return {
        id: ride.id,
        point: { lat: ride.startLat, lng: ride.startLng },
        shape: 'ring' as const,
        label: formatTime(new Date(ride.startsAt), {
          timeZone: ride.startTimezone,
        }),
        color: selected ? primary : route,
        haloColor: halo,
        selected,
        // CR-171: the start of the ride just chosen pulses — a few beats,
        // once, and only when motion is welcome.
        ...(selected && draw?.animated ? { pulse: true } : {}),
      };
    });

    const activeRide = rides.find((ride) => ride.id === activeId);
    if (activeRide && draw && linePoints) {
      // A note fades in as the drawing line reaches it.
      const revealAt = (id: string, fraction: number) => {
        if (!draw.animated) return {};
        let delay = revealDelays.current.get(id);
        if (delay === undefined) {
          delay = Math.max(
            0,
            Math.round(
              draw.startedAt + fraction * ROUTE_DRAW_MS - performance.now(),
            ),
          );
          revealDelays.current.set(id, delay);
        }
        return { revealDelayMs: delay };
      };
      const tag = { shape: 'tag' as const, color: route, haloColor: halo };

      const middle = lineMidpoint(linePoints);
      if (activeRide.difficulty !== null && middle) {
        const id = `${activeRide.id}:difficulty`;
        markers.push({
          ...tag,
          id,
          point: middle.point,
          label: DIFFICULTY_LEVEL_TERMS[activeRide.difficulty],
          meter: { filled: activeRide.difficulty, total: 5 },
          ...revealAt(id, middle.fraction),
        });
      }
      const summit = lineSummit(linePoints);
      if (summit) {
        const id = `${activeRide.id}:summit`;
        markers.push({
          ...tag,
          id,
          point: summit.point,
          label: RIDE_DISCOVERY_ROW_TERMS.summit(
            formatElevation(summit.elevationMeters),
          ),
          ...revealAt(id, summit.fraction),
        });
      }
    }

    handle.setMarkers(markers);
    // `plottableKey` stands in for `plottable`'s content; `rides` changes
    // with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, plottableKey, activeId, linePoints, themeVersion]);

  // Camera on selection (a pin click or a focused row, never a hover):
  // CR-171 frames the whole route, so its draw-in and the notes on it are in
  // view; a ride without a route gets CR-170's light shift to its start.
  // Keyed on the selection, not on `rides` — a refetch must not yank the
  // camera back — and not on the full geometry arriving: one move per choice.
  // The cached full line is used when it is already here; otherwise the
  // preview, whose bounds are the same to within a few metres.
  const focusRide = rides.find((ride) => ride.id === focusId) ?? null;
  const focusKey = focusRide
    ? `${focusRide.id}|${focusRide.startLat},${focusRide.startLng}|${
        focusRide.routePreview?.length ?? 0
      }`
    : null;
  useEffect(() => {
    if (!handle || !focusRide) return;
    const durationMs = prefersReducedMotion() ? 0 : FOCUS_MOVE_MS;
    const start =
      focusRide.startLat !== null && focusRide.startLng !== null
        ? { lat: focusRide.startLat, lng: focusRide.startLng }
        : null;
    const route: LatLng[] =
      geometryCache.current.get(focusRide.id) ??
      (focusRide.routePreview ?? []).map(([lat, lng]) => ({ lat, lng }));
    if (route.length >= 2) {
      handle.fitBounds(start ? [start, ...route] : route, {
        ...ROUTE_FIT_OPTIONS,
        durationMs,
      });
    } else if (start) {
      handle.panTo(start, { durationMs });
    }
    // `focusKey` stands in for `focusRide`'s relevant content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, focusKey]);

  if (noKey) {
    return (
      <div data-map-unavailable className="p-4">
        <RideMapPlaceholder />
      </div>
    );
  }

  const unavailable = renderFailed || basemapUnavailable;

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div
        ref={containerRef}
        role="img"
        aria-label={RIDE_DISCOVERY_ROW_TERMS.mapLabel}
        className="h-full w-full"
      />
      {/* Always mounted: a live region must exist before its text changes. */}
      <div
        role="status"
        className="pointer-events-none absolute top-2 right-14 left-2 z-10 flex lg:top-auto lg:right-auto lg:bottom-8 lg:left-4"
      >
        {unavailable ? (
          <BasemapUnavailableNotice onRetry={() => setAttempt((n) => n + 1)} />
        ) : null}
      </div>
    </div>
  );
}
