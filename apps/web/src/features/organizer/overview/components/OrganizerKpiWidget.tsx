'use client';

import {
  formatRatingParts,
  formatShortStart,
  MetricTile,
  ORGANIZER_OVERVIEW_TERMS,
  Skeleton,
} from 'ui';
import { registrationsInLastDay } from '@/lib/organizer/own-rides';
import { useOverviewData } from '../hooks/useOverviewData';
import { nearestRideValue, registeredValue } from '../lib/overview';

const CELL_CLASSNAME =
  'min-w-0 gap-2 rounded-2xl border border-border bg-bg-raised p-4 md:p-5';

/**
 * The organizer dashboard's KPI row (CR-131/CR-132, mockup screen 4):
 * Ближайший, Записано (on the nearest ride, with the last day's gain), Лист
 * ожидания (the nearest ride's own — «на «Рассветный»» — else all rides),
 * Рейтинг. CR-185: its own registry widget, below the live rides; the load
 * is shared with the head (`useOverviewData`), and the head owns the
 * no-profile and error states, so this renders nothing in either.
 */
export function OrganizerKpiWidget() {
  const { state } = useOverviewData();

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        className="col-span-full grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (state.status !== 'ready') return null;

  const { now, profile, summary, nearest, nearestParticipants } = state;
  const rating = formatRatingParts(profile.rating, profile.reviewCount);
  const lastDay = registrationsInLastDay(nearestParticipants, now);

  return (
    <div className="col-span-full grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile
        size="lg"
        className={CELL_CLASSNAME}
        label={ORGANIZER_OVERVIEW_TERMS.nearestLabel}
        value={nearest ? nearestRideValue(nearest, now) : '—'}
        note={
          nearest
            ? formatShortStart(new Date(nearest.startsAt), {
                timeZone: nearest.startTimezone,
              })
            : ORGANIZER_OVERVIEW_TERMS.nearestNone
        }
        noteTone={nearest ? 'success' : 'muted'}
      />
      <MetricTile
        size="lg"
        className={CELL_CLASSNAME}
        label={ORGANIZER_OVERVIEW_TERMS.registeredLabel}
        value={
          nearest
            ? registeredValue(
                nearestParticipants.length,
                nearest.participantLimit,
              )
            : '—'
        }
        note={
          nearest
            ? ORGANIZER_OVERVIEW_TERMS.registeredLastDay(lastDay)
            : ORGANIZER_OVERVIEW_TERMS.registeredNoRide
        }
        noteTone={nearest && lastDay > 0 ? 'success' : 'muted'}
      />
      <MetricTile
        size="lg"
        className={CELL_CLASSNAME}
        label={ORGANIZER_OVERVIEW_TERMS.waitlistLabel}
        value={String(nearest ? state.nearestWaitlisted : summary.waitlisted)}
        note={
          nearest
            ? ORGANIZER_OVERVIEW_TERMS.waitlistForRide(nearest.title)
            : ORGANIZER_OVERVIEW_TERMS.waitlistAllRides
        }
      />
      <MetricTile
        size="lg"
        className={CELL_CLASSNAME}
        label={ORGANIZER_OVERVIEW_TERMS.ratingLabel}
        value={rating.value}
        note={
          profile.reviewCount > 0
            ? ORGANIZER_OVERVIEW_TERMS.ratingReviews(profile.reviewCount)
            : ORGANIZER_OVERVIEW_TERMS.ratingNoReviews
        }
      />
    </div>
  );
}
