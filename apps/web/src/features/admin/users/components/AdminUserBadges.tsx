import type { AdminUserListItem } from 'types';
import { ADMIN_TERMS, StatusBadge } from 'ui';

/** CR-231: what kind of account this is — shown on the list row and the card. */
export function AdminUserBadges({
  user,
}: {
  user: Pick<AdminUserListItem, 'blockedAt' | 'isAdmin' | 'isOrganizer'>;
}) {
  if (!user.blockedAt && !user.isAdmin && !user.isOrganizer) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.blockedAt ? (
        <StatusBadge label={ADMIN_TERMS.badgeBlocked} tone="danger" />
      ) : null}
      {user.isAdmin ? (
        <StatusBadge label={ADMIN_TERMS.badgeAdmin} tone="info" />
      ) : null}
      {user.isOrganizer ? (
        <StatusBadge label={ADMIN_TERMS.badgeOrganizer} tone="neutral" />
      ) : null}
    </div>
  );
}
