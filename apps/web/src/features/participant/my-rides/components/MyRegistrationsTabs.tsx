import { MY_REGISTRATIONS_TERMS } from 'ui';

export type RegistrationsTab = 'upcoming' | 'past';

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
 * `/me/rides` (CR-091, `docs/design.md` §8 "Upcoming / past tabs"). A plain
 * two-button tab group, not a shared `packages/ui` primitive — same "structurally
 * trivial, one feature-local instance" reasoning `DiscoveryViewToggle` (CR-026)
 * already used (KI-020 stays open).
 */
export function MyRegistrationsTabs({
  tab,
  onChange,
}: {
  tab: RegistrationsTab;
  onChange: (tab: RegistrationsTab) => void;
}) {
  return (
    <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-surface p-1">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'upcoming'}
        className={tabClassName(tab === 'upcoming')}
        onClick={() => onChange('upcoming')}
      >
        {MY_REGISTRATIONS_TERMS.tabUpcoming}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'past'}
        className={tabClassName(tab === 'past')}
        onClick={() => onChange('past')}
      >
        {MY_REGISTRATIONS_TERMS.tabPast}
      </button>
    </div>
  );
}
