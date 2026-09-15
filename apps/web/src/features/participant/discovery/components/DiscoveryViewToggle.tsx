import { RIDE_DISCOVERY_TERMS } from 'ui';

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
 * (KI-020 stays open). The `lg`+ split list+map layout named in §11 is left to
 * CR-044's responsive audit (`.claude/context/current-task.md`) — this toggle
 * implements §8's behavior literally.
 */
export function DiscoveryViewToggle({
  view,
  onChange,
}: {
  view: DiscoveryView;
  onChange: (view: DiscoveryView) => void;
}) {
  return (
    <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-bg p-1">
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
