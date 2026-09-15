import { BICYCLE_TYPES, type BicycleType } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  RIDE_CREATE_TERMS,
  RIDE_DISCOVERY_TERMS,
} from 'ui';

/**
 * `/` (CR-025, "Filters"). Feature-local, not `packages/ui` — no shared `Select`
 * primitive exists yet (KI-020), and a plain native `<select>` is enough for the
 * one filter dimension this ticket ships (`.claude/context/current-task.md`).
 * Reuses `RIDE_CREATE_TERMS.bicycleTypeLabel` for the `<label>` text instead of
 * minting a duplicate string.
 */
export function RideFilters({
  bicycleType,
  onChange,
}: {
  bicycleType: BicycleType | undefined;
  onChange: (value: BicycleType | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-text-secondary">
        {RIDE_CREATE_TERMS.bicycleTypeLabel}
      </span>
      <select
        value={bicycleType ?? ''}
        onChange={(event) =>
          onChange(
            event.target.value === ''
              ? undefined
              : (event.target.value as BicycleType),
          )
        }
        className="min-h-11 w-fit rounded-lg border border-border-input bg-bg-raised px-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <option value="">{RIDE_DISCOVERY_TERMS.filterAllOption}</option>
        {BICYCLE_TYPES.map((type) => (
          <option key={type} value={type}>
            {BICYCLE_TYPE_TERMS[type]}
          </option>
        ))}
      </select>
    </label>
  );
}
