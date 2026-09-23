// CR-120: feature-local types for the pace-groups editor. Shared contracts
// (`RideGroup`, request schemas, bounds) come from `packages/types`.

/** The add/edit form as typed — strings, so «27,5» survives until submit. */
export interface GroupFormState {
  name: string;
  pace: string;
  description: string;
}

export type GroupFieldErrors = Partial<Record<keyof GroupFormState, string>>;
