import { formatDate } from 'ui';

/** CR-269: a legal date always names its year — `now` far from it forces it. */
export function formatLegalDate(isoDate: string): string {
  return formatDate(new Date(isoDate), { now: new Date(0) });
}
