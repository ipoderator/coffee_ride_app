import { ORGANIZER_GROUPS_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the pace-groups editor (CR-120).
export const organizerGroupsRideSection: RideSectionLink = {
  label: ORGANIZER_GROUPS_TERMS.rideEditLink,
  segment: 'groups',
  order: 30,
};
