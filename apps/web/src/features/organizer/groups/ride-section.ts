import { ORGANIZER_GROUPS_TERMS, RIDE_SECTION_HEAD_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the pace-groups editor (CR-120).
export const organizerGroupsRideSection: RideSectionLink = {
  label: ORGANIZER_GROUPS_TERMS.rideEditLink,
  hint: ORGANIZER_GROUPS_TERMS.rideEditLinkHint,
  title: RIDE_SECTION_HEAD_TERMS.groups.title,
  description: RIDE_SECTION_HEAD_TERMS.groups.description,
  icon: 'AccountAdd',
  segment: 'groups',
  order: 30,
};
