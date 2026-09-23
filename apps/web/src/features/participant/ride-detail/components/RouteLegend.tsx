import type { RoutePoint, Stop } from 'types';
import {
  formatDuration,
  RIDE_DETAIL_REGISTRATION_TERMS,
  ROUTE_POINT_TYPE_TERMS,
  STOPS_TERMS,
} from 'ui';
import {
  ROUTE_POINT_MARKER_COLOR_VAR,
  ROUTE_POINT_MARKER_LABEL,
  STOP_MARKER_COLOR_VAR,
  STOP_MARKER_LABEL,
} from '../lib/route-point-colors';

/**
 * The same colored-dot-plus-glyph mark the map draws for each pin, so the
 * legend reads as a key to what's actually on the map. The color is a
 * design-token custom property, never a literal (`docs/design.md` §14); the
 * glyph keeps markers distinguishable without color (§12).
 */
function LegendMark({ colorVar, label }: { colorVar: string; label: string }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full font-display text-xs leading-none font-semibold text-on-primary"
      style={{ background: `var(${colorVar})` }}
    >
      {label}
    </span>
  );
}

/**
 * CR-119: «Условные знаки» — a printed map's key, listing every typed route
 * point (type + the organizer's own label) and every named stop in route order.
 * Replaces the CR-030 `StopList` side rail and the map's inline chip legend:
 * one list that doubles as the map's non-visual equivalent (§12 — a map-only
 * feature with no list equivalent is an accessibility failure).
 */
export function RouteLegend({
  routePoints,
  stops,
  showRideStart,
}: {
  routePoints: RoutePoint[];
  stops: Stop[];
  /** The ride's own start pin (no `start` route point marks it). */
  showRideStart: boolean;
}) {
  if (routePoints.length === 0 && stops.length === 0 && !showRideStart) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xs font-semibold tracking-[0.06em] text-text-secondary uppercase">
        {RIDE_DETAIL_REGISTRATION_TERMS.legendTitle}
      </h2>
      {(showRideStart || routePoints.length > 0) && (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {showRideStart && (
            <li className="flex items-start gap-3 py-2">
              <LegendMark
                colorVar={ROUTE_POINT_MARKER_COLOR_VAR.start}
                label={ROUTE_POINT_MARKER_LABEL.start}
              />
              <span className="text-sm text-text">
                {ROUTE_POINT_TYPE_TERMS.start}
              </span>
            </li>
          )}
          {routePoints.map((point) => (
            <li key={point.id} className="flex items-start gap-3 py-2">
              <LegendMark
                colorVar={ROUTE_POINT_MARKER_COLOR_VAR[point.type]}
                label={ROUTE_POINT_MARKER_LABEL[point.type]}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-text">
                  {point.label ?? ROUTE_POINT_TYPE_TERMS[point.type]}
                </span>
                {point.label &&
                  point.label !== ROUTE_POINT_TYPE_TERMS[point.type] && (
                    <span className="text-xs text-text-secondary">
                      {ROUTE_POINT_TYPE_TERMS[point.type]}
                    </span>
                  )}
                {point.description && (
                  <span className="text-xs text-text-secondary">
                    {point.description}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {stops.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">
            {STOPS_TERMS.sectionTitle}
          </h3>
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {stops.map((stop, index) => (
              <li key={stop.id} className="flex items-start gap-3 py-2">
                <LegendMark
                  colorVar={STOP_MARKER_COLOR_VAR}
                  label={STOP_MARKER_LABEL}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-text">
                    {index + 1}. {stop.name}
                  </span>
                  {stop.description && (
                    <span className="text-sm text-text-secondary">
                      {stop.description}
                    </span>
                  )}
                </span>
                {stop.durationMinutes !== null && (
                  <span className="shrink-0 text-sm text-text-secondary tabular-nums">
                    <span className="sr-only">
                      {RIDE_DETAIL_REGISTRATION_TERMS.stopDuration}:{' '}
                    </span>
                    {formatDuration(stop.durationMinutes)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
