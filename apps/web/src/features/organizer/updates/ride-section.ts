import { RIDE_EDIT_TERMS, RIDE_SECTION_HEAD_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the ride's updates composer.
export const organizerUpdatesRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.updatesLink,
  hint: RIDE_EDIT_TERMS.updatesLinkHint,
  title: RIDE_SECTION_HEAD_TERMS.updates.title,
  description: RIDE_SECTION_HEAD_TERMS.updates.description,
  icon: 'Send',
  segment: 'updates',
  order: 50,
};
