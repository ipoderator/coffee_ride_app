import { RIDE_EDIT_TERMS, RIDE_SECTION_HEAD_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the ride's participant list.
export const organizerParticipantsRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.participantsLink,
  hint: RIDE_EDIT_TERMS.participantsLinkHint,
  title: RIDE_SECTION_HEAD_TERMS.participants.title,
  description: RIDE_SECTION_HEAD_TERMS.participants.description,
  icon: 'Users',
  segment: 'participants',
  order: 40,
};
