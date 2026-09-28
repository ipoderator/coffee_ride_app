import { organizerRouteRideSection } from '@/features/organizer/route/ride-section';
import { organizerCoverRideSection } from '@/features/organizer/cover-image/ride-section';
import { organizerGroupsRideSection } from '@/features/organizer/groups/ride-section';
import { organizerParticipantsRideSection } from '@/features/organizer/participants/ride-section';
import { organizerUpdatesRideSection } from '@/features/organizer/updates/ride-section';
import type { RideSectionLink } from './types';

// KI-061, ADR-009 registry (`.claude/rules/extensibility.md`): the links from a
// ride's edit screen to its sub-pages. A new ride sub-page adds its own
// descriptor here, not another `<Link>` in `EditRideForm`.
export const ORGANIZER_RIDE_SECTIONS: RideSectionLink[] = [
  organizerRouteRideSection,
  organizerCoverRideSection,
  organizerGroupsRideSection,
  organizerParticipantsRideSection,
  organizerUpdatesRideSection,
].sort((a, b) => a.order - b.order);
