'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type {
  OrganizerProfileResponse,
  OrganizerRideSummary,
  Ride,
  RideParticipantSummary,
} from 'types';
import {
  fetchNearestOwnRide,
  listAllRideParticipants,
  listAllRideWaitlist,
} from '@/lib/organizer/own-rides';
import { ApiError, getOwnOrganizerProfile, getOwnRideSummary } from '../api';

export type OverviewState =
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
      nearestWaitlisted: number;
    };

async function loadOverview(): Promise<OverviewState> {
  // CR-133 (KI-066): every read starts at mount, not after the profile,
  // so `/rides/mine` and the nearest ride's participants join the sidebar
  // badge's and the activity widget's in-flight requests (`own-rides.ts`).
  // Without a profile their results (or failures) are simply dropped.
  const now = new Date();
  const summaryRead = getOwnRideSummary();
  const nearestRead = fetchNearestOwnRide(now);
  summaryRead.catch(() => undefined);
  nearestRead.catch(() => undefined);
  let profile: OrganizerProfileResponse;
  try {
    profile = await getOwnOrganizerProfile();
  } catch (error) {
    if (error instanceof ApiError && error.problem.status === 404) {
      return { status: 'noProfile' };
    }
    throw error;
  }
  const [{ summary }, nearest] = await Promise.all([summaryRead, nearestRead]);
  const [nearestParticipants, nearestWaitlist] = nearest
    ? await Promise.all([
        listAllRideParticipants(nearest.id),
        listAllRideWaitlist(nearest.id),
      ])
    : [[], []];
  return {
    status: 'ready',
    now,
    profile,
    summary,
    nearest,
    nearestParticipants,
    nearestWaitlisted: nearestWaitlist.length,
  };
}

// CR-185: the dashboard head (greeting) and the KPI row are two registry
// widgets — live rides sit between them (handoff: active work above the
// statistics) — but one load. A tiny shared store: the first subscriber
// starts the load, a retry from either part reloads both, and the last one
// to unmount resets it, so coming back to the dashboard reads fresh data.
let snapshot: OverviewState = { status: 'loading' };
let generation = 0;
let started = false;
const listeners = new Set<() => void>();

function emit(next: OverviewState) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function reload() {
  const current = ++generation;
  started = true;
  emit({ status: 'loading' });
  loadOverview()
    .then((next) => {
      if (current === generation) emit(next);
    })
    .catch(() => {
      if (current === generation) emit({ status: 'error' });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      // Drop whatever is in flight and start over on the next mount.
      generation += 1;
      started = false;
      snapshot = { status: 'loading' };
    }
  };
}

const getSnapshot = () => snapshot;

export function useOverviewData(): {
  state: OverviewState;
  retry: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!started) reload();
  }, []);
  return { state, retry: reload };
}
