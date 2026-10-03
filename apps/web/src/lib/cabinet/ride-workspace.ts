'use client';

import { createContext, useContext } from 'react';
import type { GetRideResponse, Ride, RideUpdate } from 'types';
import type { StatusTone } from 'ui';
import type { RideSectionLink } from './types';

/**
 * CR-187: what the ride workspace frame (`features/organizer/rides/components/
 * RideWorkspace.tsx`) knows about the ride it frames — `GET /v1/rides/:id`'s
 * organizer-relevant fields plus the latest update. Lives here, not in the
 * rides feature, so the section features (route, cover, groups, participants,
 * updates) can read it and ask for a refresh without importing another
 * feature's internals (`.claude/rules/extensibility.md`).
 */
export type RideWorkspaceData = Pick<
  GetRideResponse,
  | 'ride'
  | 'route'
  | 'stops'
  | 'routePoints'
  | 'groups'
  | 'registrationsCount'
  | 'waitlistCount'
  | 'attendanceSummary'
  | 'requirements'
  | 'contact'
  | 'lastReschedule'
> & {
  /** Newest sent update: `null` = none yet, `undefined` = couldn't be read. */
  latestUpdate: RideUpdate | null | undefined;
};

export interface RideWorkspaceContextValue {
  data: RideWorkspaceData;
  /** Flag-filtered, ordered sub-page descriptors (ADR-009 registry). */
  sections: readonly RideSectionLink[];
  /** Re-reads the ride quietly (no skeleton) after a section changed it. */
  refresh: () => Promise<void>;
  /** A mutation returned the ride: show it, and an optional result line in
   * the frame (a lifecycle step's «Заезд опубликован.»). A status change
   * remounts the section below with fresh data. */
  applyRide: (ride: Ride, message?: string) => void;
}

export const RideWorkspaceContext =
  createContext<RideWorkspaceContextValue | null>(null);

/** `null` outside the frame — a section component still works on its own
 * (tests, stories, the wizard before CR-187). */
export function useRideWorkspace(): RideWorkspaceContextValue | null {
  return useContext(RideWorkspaceContext);
}

/**
 * CR-187: one section's state on the overview checklist and in its own head —
 * concrete words, never just a colour (`docs/design.md` §12).
 */
export interface RideSectionReadiness {
  tone: StatusTone;
  /** Row title on the overview, e.g. «Маршрут готов». */
  title: string;
  /** One line of specifics, e.g. «42 км · 380 м набора · 2 остановки». */
  detail?: string;
  /** Short chip beside the section's heading, e.g. «Трек загружен». */
  chip: string;
  /** The row's link label («Посмотреть», «Добавить»); `null` = no useful
   * step there (the spec: preparation buttons lead to a doable step). */
  action: string | null;
}

/** `null` = the section has nothing to say at this status (no row). */
export type RideReadinessResolver = (
  data: RideWorkspaceData,
) => RideSectionReadiness | null;
