import { RIDE_READINESS_TERMS } from 'ui';
import type { RideReadinessResolver } from '@/lib/cabinet/ride-workspace';

const T = RIDE_READINESS_TERMS.participants;

/**
 * CR-187: the participants row/chip, by phase — the list before the start,
 * the finish marks once started (CR-181), the closing tally after (CR-182).
 * A draft has nobody to show, so no row at all.
 */
export const participantsReadiness: RideReadinessResolver = ({
  ride,
  registrationsCount: count,
  waitlistCount,
  attendanceSummary,
}) => {
  switch (ride.status) {
    case 'draft':
      return null;
    case 'published':
      return {
        tone: 'neutral',
        title: T.notOpenTitle,
        detail: T.notOpenDetail,
        chip: T.notOpenChip,
        action: null,
      };
    case 'registration_open':
    case 'registration_closed': {
      const limit = ride.participantLimit;
      return {
        tone: count > 0 ? 'success' : 'neutral',
        title: count > 0 ? T.registeredTitle(count) : T.noneTitle,
        detail:
          limit === null
            ? T.placesUnlimited(waitlistCount)
            : T.placesLimited(Math.max(limit - count, 0), limit, waitlistCount),
        chip: T.registeredChip(count),
        action: T.actionOpen,
      };
    }
    case 'started': {
      if (count === 0) {
        return {
          tone: 'neutral',
          title: T.noneTitle,
          chip: T.registeredChip(0),
          action: null,
        };
      }
      const unresolved = attendanceSummary?.unresolved ?? count;
      return {
        tone: unresolved > 0 ? 'warning' : 'success',
        title: T.startedTitle,
        detail: T.startedDetail(count - unresolved, count),
        chip: unresolved > 0 ? T.unresolvedChip(unresolved) : T.allMarkedChip,
        action: T.actionMark,
      };
    }
    case 'finished': {
      if (count === 0 || !attendanceSummary) {
        return {
          tone: 'neutral',
          title: T.finishedTitle,
          chip: T.registeredChip(count),
          action: count > 0 ? T.actionOpen : null,
        };
      }
      const { finished, dnf, noShow, unresolved } = attendanceSummary;
      return {
        tone: unresolved > 0 ? 'warning' : 'success',
        title: T.finishedTitle,
        detail: T.finishedDetail(finished, dnf, noShow),
        chip: unresolved > 0 ? T.unconfirmedChip(unresolved) : T.finishedChip,
        action: T.actionOpen,
      };
    }
    case 'cancelled':
      return {
        tone: 'neutral',
        title: T.cancelledTitle,
        detail: T.cancelledDetail,
        chip: T.registeredChip(count),
        action: count > 0 ? T.actionOpen : null,
      };
  }
};
