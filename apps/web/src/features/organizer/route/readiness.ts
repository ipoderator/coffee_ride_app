import { formatDistance, formatElevation, RIDE_READINESS_TERMS } from 'ui';
import type { RideReadinessResolver } from '@/lib/cabinet/ride-workspace';

const T = RIDE_READINESS_TERMS.route;

/** CR-187: the route row/chip. Changeable only in a draft (`docs/api.md` →
 * route endpoints), so a published ride without a track says so in words. */
export const routeReadiness: RideReadinessResolver = ({
  ride,
  route,
  stops,
}) => {
  const isDraft = ride.status === 'draft';
  if (route) {
    return {
      tone: 'success',
      title: T.readyTitle,
      detail: T.readyDetail(
        formatDistance(route.distanceKm),
        formatElevation(route.elevationGainMeters),
        stops.length,
      ),
      chip: T.readyChip,
      action: isDraft ? T.actionEdit : T.actionView,
    };
  }
  return isDraft
    ? {
        tone: 'warning',
        title: T.missingDraftTitle,
        detail: T.missingDraftDetail,
        chip: T.missingChip,
        action: T.actionAdd,
      }
    : {
        tone: 'neutral',
        title: T.missingLockedTitle,
        detail: T.missingLockedDetail,
        chip: T.missingChip,
        action: T.actionView,
      };
};
