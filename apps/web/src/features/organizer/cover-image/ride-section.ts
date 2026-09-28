import { RIDE_EDIT_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the cover image upload.
export const organizerCoverRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.coverLink,
  segment: 'cover',
  order: 20,
};
