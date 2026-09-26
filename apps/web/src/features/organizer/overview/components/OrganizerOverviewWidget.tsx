'use client';

import { Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  OrganizerProfileResponse,
  OrganizerRideSummary,
  Ride,
  RideParticipantSummary,
} from 'types';
import {
  buttonClassName,
  Card,
  EmptyState,
  ErrorState,
  formatRatingParts,
  formatShortStart,
  MetricTile,
  ORGANIZER_OVERVIEW_TERMS,
  ORGANIZER_TERMS,
  Skeleton,
} from 'ui';
import {
  fetchNearestOwnRide,
  listAllRideParticipants,
} from '@/lib/organizer/own-rides';
import { ApiError, getOwnOrganizerProfile, getOwnRideSummary } from '../api';
import {
  nearestRideValue,
  registeredValue,
  registrationsInLastDay,
} from '../lib/overview';

type State =
  | { status: 'loading' }
  | { status: 'noProfile' }
  | { status: 'error' }
  | {
      status: 'ready';
      now: Date;
      profile: OrganizerProfileResponse;
      summary: OrganizerRideSummary;
      nearest: Ride | null;
      nearestParticipants: RideParticipantSummary[];
    };

/**
 * `/organizer` (CR-131, ADR-024 mockup screen 4): the dashboard's head — the
 * organizer's name, a time-of-day greeting, «Отправить обновление» for the
 * nearest ride — and the mockup's four KPI cells: Ближайший, Записано (on
 * the nearest ride, with the last day's gain), Лист ожидания (all rides),
 * Рейтинг. Existing endpoints only; «nearest» is `lib/organizer/own-rides`'s
 * shared definition, the same one the sidebar's «Участники»/«Обновления»
 * resolve. Replaces CR-015's profile card and CR-103's ride-count cells on
 * this page (the profile stays one sidebar click away).
 */
export function OrganizerOverviewWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    (async (): Promise<State> => {
      let profile: OrganizerProfileResponse;
      try {
        profile = await getOwnOrganizerProfile();
      } catch (error) {
        if (error instanceof ApiError && error.problem.status === 404) {
          return { status: 'noProfile' };
        }
        throw error;
      }
      const now = new Date();
      const [{ summary }, nearest] = await Promise.all([
        getOwnRideSummary(),
        fetchNearestOwnRide(now),
      ]);
      const nearestParticipants = nearest
        ? await listAllRideParticipants(nearest.id)
        : [];
      return {
        status: 'ready',
        now,
        profile,
        summary,
        nearest,
        nearestParticipants,
      };
    })()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="col-span-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <Card className="col-span-full">
        <ErrorState
          message={ORGANIZER_OVERVIEW_TERMS.loadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </Card>
    );
  }

  if (state.status === 'noProfile') {
    return (
      <Card className="col-span-full">
        <EmptyState
          title={ORGANIZER_TERMS.dashboardWidgetEmptyTitle}
          description={ORGANIZER_TERMS.dashboardWidgetEmptyDescription}
          action={
            <Link href="/organizer/profile" className={buttonClassName()}>
              {ORGANIZER_TERMS.dashboardWidgetCreateLink}
            </Link>
          }
        />
      </Card>
    );
  }

  const { now, profile, summary, nearest, nearestParticipants } = state;
  const rating = formatRatingParts(profile.rating, profile.reviewCount);
  const lastDay = registrationsInLastDay(nearestParticipants, now);
  const cellClassName = 'rounded-2xl border border-border bg-bg-raised p-4';

  return (
    <div className="col-span-full flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-display text-xs font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {profile.organizerProfile.name}
          </p>
          <p className="font-title text-2xl font-semibold text-text md:text-3xl">
            {ORGANIZER_OVERVIEW_TERMS.greeting(now.getHours())}
          </p>
        </div>
        {nearest && (
          <Link
            href={`/organizer/rides/${nearest.id}/updates`}
            className={buttonClassName('secondary')}
          >
            <Send className="size-4" aria-hidden="true" />
            {ORGANIZER_OVERVIEW_TERMS.sendUpdate}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          className={cellClassName}
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
          className={cellClassName}
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
          className={cellClassName}
          label={ORGANIZER_OVERVIEW_TERMS.waitlistLabel}
          value={String(summary.waitlisted)}
          note={ORGANIZER_OVERVIEW_TERMS.waitlistAllRides}
        />
        <MetricTile
          className={cellClassName}
          label={ORGANIZER_OVERVIEW_TERMS.ratingLabel}
          value={rating.value}
          note={
            profile.reviewCount > 0
              ? ORGANIZER_OVERVIEW_TERMS.ratingReviews(profile.reviewCount)
              : ORGANIZER_OVERVIEW_TERMS.ratingNoReviews
          }
        />
      </div>
    </div>
  );
}
