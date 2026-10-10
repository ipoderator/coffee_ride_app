import {
  adminActionTypeValues,
  adminTargetTypeValues,
  type AdminActionType,
  type AdminTargetType,
} from 'types';
import { readAdminEnum } from '@/lib/admin/url-filters';

// CR-232: `/admin/actions?targetType=&action=`. Every action belongs to one target
// type, so the action list narrows to the chosen type, and a URL pairing an action
// with another type drops the action (it could only ever list nothing).

export type AdminActionsFilters = {
  targetType: AdminTargetType | 'any';
  action: AdminActionType | 'any';
};

export const ACTIONS_FILTER_DEFAULTS: AdminActionsFilters = {
  targetType: 'any',
  action: 'any',
};

/** The target type every logged action is about. */
export const ACTION_TARGET_TYPE: Record<AdminActionType, AdminTargetType> = {
  admin_granted: 'user',
  admin_revoked: 'user',
  user_email_verified: 'user',
  user_verification_resent: 'user',
  user_sessions_revoked: 'user',
  user_blocked: 'user',
  user_unblocked: 'user',
  ride_hidden: 'ride',
  ride_unhidden: 'ride',
  ride_cancelled: 'ride',
  review_hidden: 'review',
  review_unhidden: 'review',
};

/** The actions offered for `targetType` (all of them for «Любой»). */
export function actionsFor(
  targetType: AdminActionsFilters['targetType'],
): readonly AdminActionType[] {
  return targetType === 'any'
    ? adminActionTypeValues
    : adminActionTypeValues.filter(
        (action) => ACTION_TARGET_TYPE[action] === targetType,
      );
}

/** `action` kept only while it belongs to `targetType`. */
export function withMatchingAction(
  filters: AdminActionsFilters,
): AdminActionsFilters {
  return filters.action === 'any' ||
    actionsFor(filters.targetType).includes(filters.action)
    ? filters
    : { ...filters, action: 'any' };
}

export function parseActionsFilters(
  params: Pick<URLSearchParams, 'get'>,
): AdminActionsFilters {
  return withMatchingAction({
    targetType: readAdminEnum(
      params.get('targetType'),
      [...adminTargetTypeValues, 'any'] as const,
      'any',
    ),
    action: readAdminEnum(
      params.get('action'),
      [...adminActionTypeValues, 'any'] as const,
      'any',
    ),
  });
}
