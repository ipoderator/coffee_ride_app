import { cn, RIDE_DISCOVERY_TERMS } from 'ui';

export type DiscoveryView = 'list' | 'map';

function tabClassName(isActive: boolean): string {
  return [
    'min-h-11 rounded-lg px-4 text-sm font-medium',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive
      ? 'bg-primary text-on-primary'
      : 'bg-bg-raised text-text-secondary hover:text-text',
  ].join(' ');
}

/**
 * `/` (CR-026, `docs/design.md` §8 "Discovery — List + map toggle"). A plain
 * two-button tab group, not a shared `packages/ui` primitive — same "structurally
 * trivial, one feature-local instance" reasoning `RideFilters` (CR-025) already used
 * (KI-020 stays open).
 *
 * CR-044: at `lg`+, `DiscoveryList` shows list and map side by side (§11's split
 * view) so this toggle becomes moot there — callers pass `className="lg:hidden"` to
 * hide it once both panels are simultaneously visible, rather than this component
 * hard-coding that breakpoint decision itself.
 */
export function DiscoveryViewToggle({
  view,
  onChange,
  className,
}: {
  view: DiscoveryView;
  onChange: (view: DiscoveryView) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex w-fit gap-1 rounded-lg bg-surface p-1', className)}
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        className={tabClassName(view === 'list')}
        onClick={() => onChange('list')}
      >
        {RIDE_DISCOVERY_TERMS.viewListLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'map'}
        className={tabClassName(view === 'map')}
        onClick={() => onChange('map')}
      >
        {RIDE_DISCOVERY_TERMS.viewMapLabel}
      </button>
    </div>
  );
}
