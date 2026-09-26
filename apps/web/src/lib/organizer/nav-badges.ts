'use client';

import { useEffect, useState } from 'react';
import type { CabinetNavBadgeCounts } from '@/lib/cabinet/types';
import {
  fetchNearestOwnRide,
  listAllRideParticipants,
  registrationsInLastDay,
} from './own-rides';

/**
 * CR-132: resolves the organizer sidebar's live counters
 * (`CabinetNavItem.badge`). `newRegistrations` is the nearest ride's
 * registrations in the last 24 hours — the same number as the dashboard's
 * «+N за сутки». Read once per cabinet visit (the frame stays mounted across
 * `/organizer/*` navigations); a failed read just shows no badge — a counter
 * is never worth an error state in the nav.
 */
export async function loadOrganizerNavBadges(
  now: Date = new Date(),
): Promise<CabinetNavBadgeCounts> {
  const nearest = await fetchNearestOwnRide(now);
  if (!nearest) return {};
  const participants = await listAllRideParticipants(nearest.id);
  return { newRegistrations: registrationsInLastDay(participants, now) };
}

export function useOrganizerNavBadges(enabled: boolean): CabinetNavBadgeCounts {
  const [counts, setCounts] = useState<CabinetNavBadgeCounts>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadOrganizerNavBadges()
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch(() => {
        // No badge rather than a broken nav — see the doc comment above.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return counts;
}
