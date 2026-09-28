import { RIDE_EDIT_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the route editor (GPX, builder, points, stops).
export const organizerRouteRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.routeLink,
  segment: 'route',
  order: 10,
};
