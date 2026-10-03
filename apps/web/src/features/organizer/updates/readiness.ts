import {
  formatDate,
  formatTime,
  RIDE_READINESS_TERMS,
  RIDE_RESCHEDULE_TERMS,
} from 'ui';
import type { RideReadinessResolver } from '@/lib/cabinet/ride-workspace';

const T = RIDE_READINESS_TERMS.updates;
const EXCERPT_LENGTH = 60;

function excerpt(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim();
  return line.length > EXCERPT_LENGTH
    ? `${line.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`
    : line;
}

/**
 * CR-187: the updates row/chip — when the last message went out, not a
 * count. Updates reach active registrants only, so a draft (nobody can be
 * registered) gets no row.
 */
export const updatesReadiness: RideReadinessResolver = ({
  ride,
  latestUpdate,
}) => {
  if (ride.status === 'draft') return null;
  if (latestUpdate === undefined) {
    return {
      tone: 'neutral',
      title: T.unknownTitle,
      detail: T.unknownDetail,
      chip: T.unknownChip,
      action: T.actionOpen,
    };
  }
  if (latestUpdate === null) {
    return {
      tone: 'neutral',
      title: T.emptyTitle,
      detail: T.emptyDetail,
      chip: T.emptyChip,
      action: T.actionWrite,
    };
  }
  const sentAt = new Date(latestUpdate.createdAt);
  const timeZone = ride.startTimezone;
  const date = formatDate(sentAt, { timeZone });
  return {
    tone: 'neutral',
    title: T.latestTitle,
    detail: T.latestDetail(
      `${date}, ${formatTime(sentAt, { timeZone })}`,
      // CR-190: a reschedule's message is its reason — say what it was.
      excerpt(
        latestUpdate.reschedule
          ? RIDE_RESCHEDULE_TERMS.readinessExcerpt(latestUpdate.message)
          : latestUpdate.message,
      ),
    ),
    chip: T.latestChip(date),
    action: T.actionWrite,
  };
};
