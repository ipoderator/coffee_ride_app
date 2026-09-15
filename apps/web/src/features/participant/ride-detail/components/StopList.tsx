import type { Stop } from 'types';
import { STOPS_TERMS } from 'ui';

/**
 * `/rides/[id]`'s "Остановки" section (CR-030, `docs/design.md` §8: "stops" is part
 * of the ride detail screen). Feature-local, not `packages/ui`
 * (`.claude/rules/extensibility.md` — same precedent as `RideCard`/`RideFilters`).
 * Purely presentational: `stops` already arrives as part of `GetRideResponse`
 * (`../api.ts`'s `getRideDetail`), ordered by `position`, no separate fetch needed —
 * same embedding precedent as the route summary.
 */
export function StopList({ stops }: { stops: Stop[] }) {
  if (stops.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text">
        {STOPS_TERMS.sectionTitle}
      </h2>
      <ol className="flex flex-col gap-3">
        {stops.map((stop, index) => (
          <li
            key={stop.id}
            className="flex flex-col gap-1 border-b border-border pb-3 last:border-none last:pb-0"
          >
            <p className="text-sm font-medium text-text">
              {index + 1}. {stop.name}
            </p>
            {stop.description && (
              <p className="text-sm text-text-secondary">{stop.description}</p>
            )}
            {stop.durationMinutes !== null && (
              <p className="text-sm text-text-secondary">
                {STOPS_TERMS.durationLabel}: {stop.durationMinutes}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
