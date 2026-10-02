import { RIDE_GROUP_MAX_PER_RIDE } from 'types';
import { formatGroupPace, RIDE_READINESS_TERMS } from 'ui';
import type { RideReadinessResolver } from '@/lib/cabinet/ride-workspace';
import { isGroupsEditable } from './editable';

const T = RIDE_READINESS_TERMS.groups;

/** CR-187: the groups row/chip. Editable until the ride is finished or
 * cancelled (ADR-022), so the action follows that rule. */
export const groupsReadiness: RideReadinessResolver = ({ ride, groups }) => {
  const editable = isGroupsEditable(ride.status);
  if (groups.length > 0) {
    return {
      tone: 'success',
      title: T.readyTitle(groups.length),
      detail: groups
        .map((group) => `${group.name} ${formatGroupPace(group.paceKmh)}`)
        .join(' · '),
      chip: T.readyChip(groups.length, RIDE_GROUP_MAX_PER_RIDE),
      action: editable ? T.actionEdit : T.actionView,
    };
  }
  return {
    tone: 'neutral',
    title: T.emptyTitle,
    detail: T.emptyDetail,
    chip: T.emptyChip,
    action: editable ? T.actionAdd : null,
  };
};
