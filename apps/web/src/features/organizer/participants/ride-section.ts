import { RIDE_EDIT_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the ride's participant list.
export const organizerParticipantsRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.participantsLink,
  segment: 'participants',
  order: 40,
};
