import { RIDE_WIZARD_TERMS } from 'ui';

// CR-156: the new-ride wizard («Ночной старт» mockup, «Новый заезд · шаг 1
// из 4»). Step 1 is `/organizer/rides/new` (`?ride=<id>` once the draft
// exists); steps 2–4 are the existing ride screens opened with `?wizard=1`,
// so the route/groups/edit screens stay the one implementation of each.

export type RideWizardStepKey = keyof typeof RIDE_WIZARD_TERMS.steps;

export const WIZARD_PARAM = 'wizard';

export interface RideWizardStep {
  key: RideWizardStepKey;
  number: number;
  /** `null` while there is no draft yet — steps 2–4 need a ride id. */
  href: (rideId: string | null) => string | null;
}

export const RIDE_WIZARD_STEPS: readonly RideWizardStep[] = [
  {
    key: 'basics',
    number: 1,
    href: (rideId) =>
      rideId
        ? `/organizer/rides/new?ride=${encodeURIComponent(rideId)}`
        : '/organizer/rides/new',
  },
  {
    key: 'route',
    number: 2,
    href: (rideId) => (rideId ? rideStepHref(rideId, 'route') : null),
  },
  {
    key: 'groups',
    number: 3,
    href: (rideId) => (rideId ? rideStepHref(rideId, 'groups') : null),
  },
  {
    key: 'publish',
    number: 4,
    href: (rideId) => (rideId ? rideStepHref(rideId, 'edit') : null),
  },
];

function rideStepHref(rideId: string, segment: string): string {
  return `/organizer/rides/${encodeURIComponent(rideId)}/${segment}?${WIZARD_PARAM}=1`;
}

export function wizardStepHref(key: RideWizardStepKey, rideId: string): string {
  const step = RIDE_WIZARD_STEPS.find((candidate) => candidate.key === key);
  // Every key has a step and every step has an href once a ride id exists.
  return step!.href(rideId)!;
}

/** A page's `searchParams` value → whether it was opened from the wizard. */
export function isWizardMode(value: string | string[] | undefined): boolean {
  return value === '1';
}
