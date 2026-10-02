import type { RideStatus } from 'types';

// `docs/api.md` → "Pace groups": editable in every status except these two.
const LOCKED_STATUSES: ReadonlyArray<RideStatus> = ['finished', 'cancelled'];

export function isGroupsEditable(status: RideStatus): boolean {
  return !LOCKED_STATUSES.includes(status);
}
