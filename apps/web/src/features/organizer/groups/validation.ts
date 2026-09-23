import {
  RIDE_GROUP_DESCRIPTION_MAX_LENGTH,
  RIDE_GROUP_NAME_MAX_LENGTH,
  RIDE_GROUP_PACE_MAX_KMH,
  RIDE_GROUP_PACE_MIN_KMH,
  type CreateRideGroupRequest,
} from 'types';
import { ORGANIZER_GROUPS_TERMS as T } from 'ui';
import type { GroupFieldErrors, GroupFormState } from './types';

const PACE_STEP_KMH = 0.5;

/**
 * «27,5» / «27.5» / « 30 » → a number; anything else (empty, «27,5,1», «abc»,
 * «1e2») → `null`. Russian users type a decimal comma — the API wants a JSON
 * number, so this is the one place the two meet.
 */
export function parsePace(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** `25` → «25», `27.5` → «27,5» — the form's own input format (not a display
 * formatter: `formatSpeed` owns how a pace is *shown*). */
export function paceToInput(paceKmh: number): string {
  return String(paceKmh).replace('.', ',');
}

/**
 * Client-side mirror of `createRideGroupRequestSchema` (bounds from
 * `packages/types`), with Russian messages instead of the schema's English ones,
 * plus the editor's 0,5 km/h step. The server re-validates everything.
 */
export function validateGroupForm(
  form: GroupFormState,
):
  | { ok: true; payload: CreateRideGroupRequest }
  | { ok: false; errors: GroupFieldErrors } {
  const errors: GroupFieldErrors = {};

  const name = form.name.trim();
  if (name.length === 0) errors.name = T.nameRequired;
  else if (name.length > RIDE_GROUP_NAME_MAX_LENGTH)
    errors.name = T.nameTooLong;

  const paceKmh = parsePace(form.pace);
  if (form.pace.trim().length === 0) errors.pace = T.paceRequired;
  else if (paceKmh === null) errors.pace = T.paceNotNumber;
  else if (
    paceKmh < RIDE_GROUP_PACE_MIN_KMH ||
    paceKmh > RIDE_GROUP_PACE_MAX_KMH
  )
    errors.pace = T.paceOutOfRange;
  else if (!Number.isInteger(paceKmh / PACE_STEP_KMH)) errors.pace = T.paceStep;

  const description = form.description.trim();
  if (description.length > RIDE_GROUP_DESCRIPTION_MAX_LENGTH)
    errors.description = T.descriptionTooLong;

  if (Object.keys(errors).length > 0 || paceKmh === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: {
      name,
      paceKmh,
      description: description.length > 0 ? description : null,
    },
  };
}
