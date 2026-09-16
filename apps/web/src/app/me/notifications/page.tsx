'use client';

import { NOTIFICATIONS_TERMS } from 'ui';
import { NotificationList } from '@/features/participant/notifications/components/NotificationList';

// `/me/notifications` — "In-app notifications" (`docs/design.md` §8, CR-041).
// Session is already resolved by `CabinetShell` (the layout above this page);
// `NotificationList` does its own data fetching, same pattern `MyRidesView`
// established.
export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {NOTIFICATIONS_TERMS.pageTitle}
      </h1>
      <NotificationList />
    </div>
  );
}
