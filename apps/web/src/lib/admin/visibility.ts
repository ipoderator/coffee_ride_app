import { adminRideVisibilityValues } from 'types';
import { ADMIN_TERMS } from 'ui';

// CR-231: the «Все / Видимые / Скрытые» switch shared by the rides and the
// reviews lists (same query values on both endpoints).
export type AdminVisibility = (typeof adminRideVisibilityValues)[number];

export const ADMIN_VISIBILITY_OPTIONS = adminRideVisibilityValues.map(
  (value) => ({ value, label: ADMIN_TERMS.visibility[value] }),
);
