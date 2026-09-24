'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RiderProfile } from 'types';
import {
  Avatar,
  BICYCLE_TYPE_TERMS,
  Card,
  ErrorState,
  formatDistanceParts,
  MetricRow,
  MetricTile,
  RIDE_DETAIL_RIDERS_TERMS,
  RIDER_PROFILE_TERMS,
  Skeleton,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import { ApiError, getRiderProfile } from '../api';

type ProfileStatus =
  | 'loading'
  | 'ready'
  | 'unauthorized'
  | 'hidden'
  | 'private'
  | 'not_found'
  | 'error';

/**
 * CR-126: a rider's profile card (`/rides/[id]/riders/[registrationId]`) —
 * bio, garage, self-reported distance stats, recent rides. Fetches on mount;
 * same status-machine shape as `RidersSection` (`../ride-detail/components/
 * RidersSection.tsx`) — a distinct state per `ApiError` this endpoint can
 * throw, rather than one generic error for every code.
 */
export function RiderProfileCard({
  rideId,
  registrationId,
}: {
  rideId: string;
  registrationId: string;
}) {
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getRiderProfile(rideId, registrationId)
      .then((response) => {
        if (cancelled) return;
        setProfile(response.profile);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          if (error.problem.status === 401) {
            setStatus('unauthorized');
            return;
          }
          if (error.problem.code === 'riders_hidden') {
            setStatus('hidden');
            return;
          }
          if (error.problem.code === 'profile_private') {
            setStatus('private');
            return;
          }
          if (error.problem.status === 404) {
            setStatus('not_found');
            return;
          }
        }
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, registrationId, attempt]);

  return (
    <Card className="flex flex-col gap-6">
      {status === 'loading' && (
        <div className="flex flex-col gap-4" aria-hidden>
          <div className="flex items-center gap-3">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {status === 'unauthorized' && (
        <p className="text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover"
          >
            {RIDE_DETAIL_RIDERS_TERMS.signInPrompt}
          </Link>
        </p>
      )}

      {status === 'hidden' && (
        <p className="text-sm text-text-secondary">
          {RIDE_DETAIL_RIDERS_TERMS.hiddenByOrganizer}
        </p>
      )}

      {status === 'private' && (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-text">
            {RIDER_PROFILE_TERMS.profilePrivateTitle}
          </p>
          <p className="text-sm text-text-secondary">
            {RIDER_PROFILE_TERMS.profilePrivateDescription}
          </p>
        </div>
      )}

      {status === 'not_found' && (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-text">
            {RIDER_PROFILE_TERMS.notFoundTitle}
          </p>
          <p className="text-sm text-text-secondary">
            {RIDER_PROFILE_TERMS.notFoundDescription}
          </p>
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          message={RIDER_PROFILE_TERMS.loadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {status === 'ready' && profile && (
        <RiderProfileContent profile={profile} />
      )}
    </Card>
  );
}

function RiderProfileContent({ profile }: { profile: RiderProfile }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar
          src={profile.avatarUrl ? apiAssetUrl(profile.avatarUrl) : null}
          name={profile.displayName}
          size="xl"
        />
        <h1 className="font-display text-xl font-semibold text-text">
          {profile.displayName ?? RIDE_DETAIL_RIDERS_TERMS.noName}
        </h1>
      </div>

      {profile.bio && (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
            {RIDER_PROFILE_TERMS.bioLabel}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-text">{profile.bio}</p>
        </div>
      )}

      <MetricRow className="grid-cols-3 gap-x-4 border-y border-border py-4 sm:grid-cols-3 md:flex md:flex-row md:gap-8">
        <MetricTile
          label={RIDER_PROFILE_TERMS.distanceWeekLabel}
          {...formatDistanceParts(profile.distanceWeekKm)}
        />
        <MetricTile
          label={RIDER_PROFILE_TERMS.distanceMonthLabel}
          {...formatDistanceParts(profile.distanceMonthKm)}
        />
        <MetricTile
          label={RIDER_PROFILE_TERMS.distanceYearLabel}
          {...formatDistanceParts(profile.distanceYearKm)}
        />
      </MetricRow>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-semibold text-text">
          {RIDER_PROFILE_TERMS.garageTitle}
        </h2>
        {profile.bikes.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {RIDER_PROFILE_TERMS.noBikes}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {profile.bikes.map((bike) => (
              <li
                key={bike.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-text">
                  {BICYCLE_TYPE_TERMS[bike.bikeType]}
                  {' · '}
                  {bike.brand || bike.model
                    ? [bike.brand, bike.model].filter(Boolean).join(' ')
                    : RIDER_PROFILE_TERMS.unnamedBike}
                </span>
                {bike.isActive && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {RIDER_PROFILE_TERMS.activeBikeLabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-semibold text-text">
          {RIDER_PROFILE_TERMS.recentRidesTitle}
        </h2>
        {profile.recentRides.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {RIDER_PROFILE_TERMS.recentRidesEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {profile.recentRides.map((ride) => (
              <li key={ride.id} className="py-2 text-sm">
                <Link
                  href={`/rides/${ride.id}`}
                  className="font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover"
                >
                  {ride.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
