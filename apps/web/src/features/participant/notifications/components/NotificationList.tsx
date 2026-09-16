'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Notification } from 'types';
import {
  Card,
  EmptyState,
  ErrorState,
  NOTIFICATIONS_TERMS,
  Skeleton,
  formatDate,
  formatTime,
} from 'ui';
import { listMyNotifications, markNotificationRead } from '../api';

type LoadStatus = 'loading' | 'ready' | 'error';

const TYPE_LABEL: Record<Notification['type'], string> = {
  registration_confirmed: NOTIFICATIONS_TERMS.registrationConfirmedLabel,
  ride_update: NOTIFICATIONS_TERMS.rideUpdateLabel,
  ride_cancelled: NOTIFICATIONS_TERMS.rideCancelledLabel,
};

/**
 * `/me/notifications` (CR-041, `docs/design.md` §8). One page, newest first — no
 * "load more" UI yet, same precedent every other list screen in this repo already
 * established. No unread-count badge, no bulk "mark all read"
 * (`.claude/context/current-task.md`'s scope decision) — clicking a card marks it
 * read (fire-and-forget, optimistic) and links into the ride it's about.
 */
export function NotificationList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;

    listMyNotifications()
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleClick(notification: Notification) {
    if (notification.readAt) return;
    setItems((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    // Fire-and-forget: a failure here doesn't block navigation, and the next
    // full reload of this screen will just show it unread again — no need to
    // surface an error for a read-receipt.
    markNotificationRead(notification.id).catch(() => {});
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={NOTIFICATIONS_TERMS.loadError} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={NOTIFICATIONS_TERMS.emptyTitle}
        description={NOTIFICATIONS_TERMS.emptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const createdAt = new Date(item.createdAt);
        const isUnread = item.readAt === null;
        return (
          <Link
            key={item.id}
            href={`/rides/${item.ride.id}`}
            onClick={() => handleClick(item)}
          >
            <Card
              className={
                isUnread
                  ? 'flex flex-col gap-2 border-primary transition-opacity hover:opacity-90'
                  : 'flex flex-col gap-2 transition-opacity hover:opacity-90'
              }
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text">
                  {TYPE_LABEL[item.type]}
                </p>
                {isUnread && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">
                    {NOTIFICATIONS_TERMS.unreadLabel}
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{item.ride.title}</p>
              {item.message && (
                <p className="text-sm text-text">{item.message}</p>
              )}
              <p className="text-xs text-text-muted">
                {formatDate(createdAt)} {formatTime(createdAt)}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
