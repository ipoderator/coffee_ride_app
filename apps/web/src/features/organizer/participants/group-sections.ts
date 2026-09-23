import { PARTICIPANTS_GROUP_TERMS, formatGroupPace } from 'ui';
import type {
  RideGroupRef,
  RideGroupSummary,
  RideParticipantSummary,
} from './api';

/** «Группа 1 · 25 км/ч», or «—» for no group (CR-120). */
export function formatGroupRef(group: RideGroupRef | null): string {
  if (!group) return PARTICIPANTS_GROUP_TERMS.noGroup;
  return `${group.name} · ${formatGroupPace(group.paceKmh)}`;
}

export interface GroupSection {
  /** `null` = participants without a group (registered before groups existed). */
  group: RideGroupRef | null;
  items: RideParticipantSummary[];
}

/**
 * CR-120: splits the participant list under group headings. Order is the
 * ride's own group order (`rideGroups`, `position` order) — every group gets a
 * section, even an empty one, so the organizer sees the whole split — then one
 * «Без группы» section if anyone has no group. Within a section the server's
 * registration order is kept. If `rideGroups` couldn't be loaded (`null`), the
 * groups the items themselves reference are used, in first-seen order.
 *
 * Returns `null` when the ride has no groups at all: the caller keeps its
 * original flat list.
 */
export function buildGroupSections(
  items: RideParticipantSummary[],
  rideGroups: RideGroupSummary[] | null,
): GroupSection[] | null {
  const order = new Map<string, RideGroupRef>();
  for (const group of rideGroups ?? []) {
    order.set(group.id, {
      id: group.id,
      name: group.name,
      paceKmh: group.paceKmh,
    });
  }
  for (const item of items) {
    if (item.group && !order.has(item.group.id)) {
      order.set(item.group.id, item.group);
    }
  }
  if (order.size === 0) return null;

  const sections: GroupSection[] = [...order.values()].map((group) => ({
    group,
    items: items.filter((item) => item.group?.id === group.id),
  }));
  const ungrouped = items.filter((item) => item.group === null);
  if (ungrouped.length > 0) sections.push({ group: null, items: ungrouped });
  return sections;
}
