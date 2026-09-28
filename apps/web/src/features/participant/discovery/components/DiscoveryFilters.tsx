import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  BICYCLE_TYPES,
  DIFFICULTY_LEVELS,
  type BicycleType,
  type DifficultyLevel,
} from 'types';
import {
  BICYCLE_TYPE_TERMS,
  DIFFICULTY_LEVEL_TERMS,
  RIDE_CREATE_TERMS,
  RIDE_DISCOVERY_TERMS,
  cn,
} from 'ui';
import {
  PACE_BUCKETS,
  type DiscoveryFilters as Filters,
  type PaceBucket,
} from '../lib/discovery-filters';

// CR-153: 44px pills (`docs/design.md` §5); a chosen chip is outlined in
// `primary` on its tint — plus `aria-pressed`/the select's own value, never
// colour alone.
function chipClassName(active: boolean): string {
  return cn(
    'relative inline-flex min-h-11 shrink-0 items-center rounded-full border text-body-sm font-medium whitespace-nowrap text-text transition-colors',
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    active
      ? 'border-primary bg-primary-tint'
      : 'border-border-input bg-bg-raised hover:border-text-muted',
  );
}

function ToggleChip({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(chipClassName(pressed), 'px-4')}
    >
      {label}
    </button>
  );
}

/**
 * A native `<select>` dressed as a chip: the platform picker on a phone,
 * keyboard and screen-reader behaviour for free (no shared `Select` primitive
 * exists yet, KI-020). The empty option is the chip's resting label.
 */
function SelectChip<T extends string | number>({
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: T | undefined;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <label className={chipClassName(value !== undefined)}>
      <span className="sr-only">{label}</span>
      <select
        value={value === undefined ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(
            raw === ''
              ? undefined
              : options.find((option) => String(option.value) === raw)?.value,
          );
        }}
        className="min-h-11 cursor-pointer appearance-none rounded-full bg-transparent py-0 pr-9 pl-4 text-body-sm font-medium text-text outline-none"
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-4 text-text-secondary"
      />
    </label>
  );
}

const BICYCLE_OPTIONS = BICYCLE_TYPES.map((type) => ({
  value: type,
  label: BICYCLE_TYPE_TERMS[type],
}));
const PACE_OPTIONS = PACE_BUCKETS.map((bucket) => ({
  value: bucket,
  label: RIDE_DISCOVERY_TERMS.paceFilterOptions[bucket],
}));
const DIFFICULTY_OPTIONS = DIFFICULTY_LEVELS.map((level) => ({
  value: level,
  label: DIFFICULTY_LEVEL_TERMS[level],
}));

/**
 * `/`'s filter chips (CR-153, owner's mockup), shared by the list and the map
 * view: bicycle ▾, «Эта неделя», pace ▾, difficulty ▾, «Бесплатные». One
 * row that scrolls sideways on a phone rather than wrapping into a block.
 */
export function DiscoveryFilters({
  filters,
  onChange,
  className,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  className?: string;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div
      role="group"
      aria-label={RIDE_DISCOVERY_TERMS.filtersLabel}
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
        // The row scrolls on a phone: fade its right edge so the cut-off chip
        // reads as "more this way", not as a clipped layout.
        '[mask-image:linear-gradient(90deg,black_85%,transparent)] md:[mask-image:none]',
        className,
      )}
    >
      <SelectChip<BicycleType>
        label={RIDE_CREATE_TERMS.bicycleTypeLabel}
        anyLabel={RIDE_DISCOVERY_TERMS.filterBicycleAny}
        value={filters.bicycleType}
        options={BICYCLE_OPTIONS}
        onChange={(bicycleType) => set({ bicycleType })}
      />
      <ToggleChip
        label={RIDE_DISCOVERY_TERMS.filterThisWeek}
        pressed={filters.thisWeek}
        onToggle={() => set({ thisWeek: !filters.thisWeek })}
      />
      <SelectChip<PaceBucket>
        label={RIDE_DISCOVERY_TERMS.filterPace}
        anyLabel={RIDE_DISCOVERY_TERMS.filterPace}
        value={filters.pace}
        options={PACE_OPTIONS}
        onChange={(pace) => set({ pace })}
      />
      <SelectChip<DifficultyLevel>
        label={RIDE_DISCOVERY_TERMS.filterDifficulty}
        anyLabel={RIDE_DISCOVERY_TERMS.filterDifficulty}
        value={filters.difficulty}
        options={DIFFICULTY_OPTIONS}
        onChange={(difficulty) => set({ difficulty })}
      />
      <ToggleChip
        label={RIDE_DISCOVERY_TERMS.filterFree}
        pressed={filters.free}
        onToggle={() => set({ free: !filters.free })}
      />
    </div>
  );
}
