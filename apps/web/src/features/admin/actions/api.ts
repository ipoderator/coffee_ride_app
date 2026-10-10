import type { ListAdminActionsResponse } from 'types';
import { adminRequest, toQueryString } from '@/lib/admin/client';
import type { AdminActionsFilters } from './filters';

/** CR-231: «Журнал» — every admin action, newest first. CR-232: narrowed by
 * target type and action. */
export function listAdminActions(
  { targetType, action }: AdminActionsFilters,
  cursor?: string,
): Promise<ListAdminActionsResponse> {
  return adminRequest(
    `/actions${toQueryString({
      targetType: targetType === 'any' ? undefined : targetType,
      action: action === 'any' ? undefined : action,
      cursor,
    })}`,
  );
}
