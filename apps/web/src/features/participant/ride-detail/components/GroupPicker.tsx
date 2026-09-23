'use client';

import type { RideGroupSummary } from 'types';
import { cn, formatGroupPaceParts, RIDE_DETAIL_GROUP_TERMS } from 'ui';

function GroupPace({ paceKmh }: { paceKmh: number }) {
  const { value, unit } = formatGroupPaceParts(paceKmh);
  return (
    <span className="shrink-0 font-display text-xl leading-tight font-semibold whitespace-nowrap text-text tabular-nums">
      {value}
      <span className="ml-1 text-[0.6em] font-normal text-text-secondary">
        {unit}
      </span>
    </span>
  );
}

function GroupText({
  group,
  isViewerGroup,
}: {
  group: RideGroupSummary;
  isViewerGroup: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-base font-medium text-text">
        {group.name}
        {isViewerGroup && (
          <span className="ml-2 font-display text-xs font-semibold tracking-[0.06em] text-success uppercase">
            {RIDE_DETAIL_GROUP_TERMS.yourGroup}
          </span>
        )}
      </span>
      <span className="text-sm text-text-secondary tabular-nums">
        {RIDE_DETAIL_GROUP_TERMS.ridersCount(group.registrationsCount)}
      </span>
      {group.description && (
        <span className="text-sm text-text-secondary">{group.description}</span>
      )}
    </span>
  );
}

/**
 * CR-119: a ride's pace groups (`GetRideResponse.groups`, position order) as
 * legend-style rows — name, group count, pace in the display face.
 *
 * Two modes, one row design:
 * - with `onChange`: a real radio group — `<fieldset>`/`<legend>` + native
 *   `<input type="radio">`s, so arrow keys, form semantics and screen-reader
 *   announcements come from the platform, not re-implemented; each row is its
 *   own `<label>`, 44px+ tall (`docs/design.md` §5 touch targets);
 * - without it: a read-only list (registration closed, or the viewer is on the
 *   waitlist), marking the viewer's own group.
 */
export function GroupPicker({
  groups,
  name,
  value,
  onChange,
  legend = RIDE_DETAIL_GROUP_TERMS.pickLegend,
  disabled = false,
  viewerGroupId = null,
  id,
}: {
  groups: RideGroupSummary[];
  /** Radio `name` — unique per picker on the page. */
  name: string;
  value: string | null;
  onChange?: (groupId: string) => void;
  legend?: string;
  disabled?: boolean;
  viewerGroupId?: string | null;
  id?: string;
}) {
  if (!onChange) {
    return (
      <ul
        id={id}
        className="flex flex-col divide-y divide-border border-y border-border"
      >
        {groups.map((group) => (
          <li key={group.id} className="flex min-h-11 items-center gap-3 py-2">
            <GroupText
              group={group}
              isViewerGroup={group.id === viewerGroupId}
            />
            <GroupPace paceKmh={group.paceKmh} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <fieldset id={id} disabled={disabled} className="flex min-w-0 flex-col">
      <legend className="mb-2 font-display text-xs font-semibold tracking-[0.06em] text-text-secondary uppercase">
        {legend}
      </legend>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {groups.map((group) => {
          const checked = value === group.id;
          return (
            <label
              key={group.id}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 px-2 py-2 transition-colors',
                'hover:bg-surface has-[:disabled]:cursor-not-allowed',
                checked && 'bg-primary-tint hover:bg-primary-tint',
              )}
            >
              <input
                type="radio"
                name={name}
                value={group.id}
                checked={checked}
                onChange={() => onChange(group.id)}
                className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              <GroupText
                group={group}
                isViewerGroup={group.id === viewerGroupId}
              />
              <GroupPace paceKmh={group.paceKmh} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
