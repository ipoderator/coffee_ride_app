import { cn } from '../lib/cn';

// The atom of the metric presentation system (docs/design.md §6, CR-065): label, value,
// unit, always in that order. `value`/`unit` are meant to come from a `*Parts` formatter
// in `../format` (e.g. `formatDistanceParts(ride.distanceKm)`, spread directly — its
// `{ value, unit }` shape matches these props on purpose) rather than the plain joined
// `format*` string, since the unit must be styled differently from the value (never
// bold, never the same size).
export interface MetricTileProps {
  /** e.g. `METRIC_TERMS.distance` ("Дистанция"). Rendered uppercase. */
  label: string;
  /** Already-formatted numeric/text value, no unit — or the em dash for missing data. */
  value: string;
  /**
   * Unit suffix, rendered smaller and unemphasized. Omit (or pass `''`, `*Parts`'
   * convention for "no unit") when the metric has none of its own — e.g. participants'
   * `12 из 20` ratio.
   */
  unit?: string;
  /**
   * ADR-024: `'cell'` renders the mockup's raised metric cell (`bg-surface`,
   * rounded corners) — used on the route cover and the ride-detail headline
   * grid. Default stays the original background-less tile (docs/design.md §6:
   * "tiles never carry their own background colour; separation comes from
   * spacing") for every other existing call site.
   */
  variant?: 'plain' | 'cell';
  /**
   * CR-131: an optional one-line note under the value (the mockup's KPI
   * cells — «вс 04.10 · 09:00», «+3 за сутки»), in the mono face. `'success'`
   * tints it for a positive/near-term fact; the default is muted.
   */
  note?: string;
  noteTone?: 'muted' | 'success';
  /**
   * CR-132: `'lg'` sets the value a step larger — the organizer dashboard's
   * KPI row (mockup screen 4), where the numbers are the screen's headline.
   */
  size?: 'md' | 'lg';
  className?: string;
}

export function MetricTile({
  label,
  value,
  unit,
  variant = 'plain',
  note,
  noteTone = 'muted',
  size = 'md',
  className,
}: MetricTileProps) {
  return (
    // `<dl>` for a single term/description pair, not a generic `<div>` — a screen
    // reader associates the label with its value the same way sighted layout does.
    <dl
      className={cn(
        'flex flex-col gap-1',
        variant === 'cell' && 'rounded-xl bg-surface p-3',
        className,
      )}
    >
      {/* ADR-024: label stays in `font-display` (Sofia Sans Condensed); the
          value moves to `font-num` (Sofia Sans Extra Condensed) — the large
          tabular-numeral face the mockup uses for every metric. */}
      <dt className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
        {label}
      </dt>
      <dd
        className={cn(
          'flex items-baseline gap-1 whitespace-nowrap font-num leading-none font-extrabold tabular-nums text-text',
          size === 'lg' ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl',
        )}
      >
        <span>{value}</span>
        {unit ? (
          // The mockup's unit suffix is set in the mono face, not the
          // numeral face it follows — matches `docs/design.md` §7's existing
          // "unit smaller and unemphasized" rule, just in `font-mono` now.
          <span className="font-mono text-[0.45em] font-normal text-text-secondary">
            {unit}
          </span>
        ) : null}
      </dd>
      {note ? (
        <dd
          className={cn(
            'truncate font-mono text-xs',
            noteTone === 'success' ? 'text-success' : 'text-text-secondary',
          )}
        >
          {note}
        </dd>
      ) : null}
    </dl>
  );
}
