import type { RideStatus } from 'types';
import type { RideParticipantSummary } from './api';

/** CR-181: a finish can be claimed and decided from the start on, and after the end. */
export function isAttendanceOpen(status: RideStatus): boolean {
  return status === 'started' || status === 'finished';
}

/**
 * CR-181: the organizer's tally. `claimed` counts only claims still waiting for a
 * decision — exactly what «Подтвердить всех заявивших» would confirm.
 */
export function attendanceCounts(items: RideParticipantSummary[]) {
  let confirmed = 0;
  let claimed = 0;
  let dnf = 0;
  let noShow = 0;
  for (const item of items) {
    if (item.attendance === 'finished') confirmed += 1;
    else if (item.attendance === 'dnf') dnf += 1;
    else if (item.attendance === 'no_show') noShow += 1;
    else if (item.finishClaimedAt !== null) claimed += 1;
  }
  return { confirmed, claimed, dnf, noShow };
}
