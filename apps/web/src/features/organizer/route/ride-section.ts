import { RIDE_EDIT_TERMS, RIDE_SECTION_HEAD_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the route editor (GPX, builder, points, stops).
export const organizerRouteRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.routeLink,
  hint: RIDE_EDIT_TERMS.routeLinkHint,
  title: RIDE_SECTION_HEAD_TERMS.route.title,
  description: RIDE_SECTION_HEAD_TERMS.route.description,
  icon: 'Route',
  segment: 'route',
  order: 10,
};
