import { RIDE_EDIT_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the ride's updates composer.
export const organizerUpdatesRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.updatesLink,
  segment: 'updates',
  order: 50,
};
