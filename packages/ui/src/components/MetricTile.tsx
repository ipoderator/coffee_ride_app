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
  className?: string;
}

export function MetricTile({ label, value, unit, className }: MetricTileProps) {
  return (
    // `<dl>` for a single term/description pair, not a generic `<div>` — a screen
    // reader associates the label with its value the same way sighted layout does.
    // No background/border here on purpose (docs/design.md §6: "tiles never carry
    // their own background color; separation comes from spacing").
    <dl className={cn('flex flex-col gap-1', className)}>
      <dt className="text-xs font-medium uppercase tracking-[0.04em] text-text-secondary">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1 whitespace-nowrap text-2xl leading-tight font-semibold tabular-nums text-text md:text-3xl">
        <span>{value}</span>
        {unit ? (
          <span className="text-[0.6em] font-normal text-text-secondary">
            {unit}
          </span>
        ) : null}
      </dd>
    </dl>
  );
}
