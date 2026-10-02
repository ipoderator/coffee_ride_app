import { coverReadiness } from '@/features/organizer/cover-image/readiness';
import { groupsReadiness } from '@/features/organizer/groups/readiness';
import { participantsReadiness } from '@/features/organizer/participants/readiness';
import { routeReadiness } from '@/features/organizer/route/readiness';
import { updatesReadiness } from '@/features/organizer/updates/readiness';
import type { RideReadinessResolver } from './ride-workspace';

// CR-187, ADR-009 registry: each ride sub-page's own readiness, keyed by its
// `RideSectionLink.segment`. The overview checklist and the section heads look
// a section up here — never branch on it. A section missing from this map
// still gets a plain row (its label + hint).
export const ORGANIZER_RIDE_READINESS: Readonly<
  Record<string, RideReadinessResolver>
> = {
  route: routeReadiness,
  cover: coverReadiness,
  groups: groupsReadiness,
  participants: participantsReadiness,
  updates: updatesReadiness,
};
