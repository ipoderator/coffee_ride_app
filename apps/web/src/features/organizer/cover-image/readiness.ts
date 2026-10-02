import { RIDE_READINESS_TERMS } from 'ui';
import type { RideReadinessResolver } from '@/lib/cabinet/ride-workspace';

const T = RIDE_READINESS_TERMS.cover;

/** CR-187: the cover row/chip — same draft-only rule as the route. */
export const coverReadiness: RideReadinessResolver = ({ ride }) => {
  const isDraft = ride.status === 'draft';
  if (ride.coverImageUrl) {
    return {
      tone: 'success',
      title: T.readyTitle,
      detail: T.readyDetail,
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
        // Nothing to look at and nothing to change: no link.
        tone: 'neutral',
        title: T.missingLockedTitle,
        detail: T.missingLockedDetail,
        chip: T.missingChip,
        action: null,
      };
};
