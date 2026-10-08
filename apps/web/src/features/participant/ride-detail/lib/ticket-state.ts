import type { RideStatus } from 'types';
import {
  RIDE_DISCOVERY_TERMS,
  RIDE_STATUS_TERMS,
  RIDE_TICKET_TERMS,
  type StatusTone,
} from 'ui';

/** Three or fewer seats left reads as «Мало мест» — the discovery card's
 * threshold, duplicated rather than imported across feature modules
 * (`.claude/rules/extensibility.md`). */
export const LOW_SEATS_THRESHOLD = 3;

/**
 * CR-151: which face the registration ticket shows. The viewer's own state
 * wins over the ride's (a registered viewer on a closed ride still sees their
 * ticket), except `cancelled`, which voids every registration.
 */
export type TicketState =
  | 'open'
  | 'few'
  | 'full'
  | 'waitlisted'
  | 'registered'
  | 'notOpen'
  | 'closed'
  | 'started'
  | 'finished'
  | 'cancelled';

export function seatsLeftOf(
  participantLimit: number | null,
  registrationsCount: number,
): number | null {
  return participantLimit === null
    ? null
    : Math.max(0, participantLimit - registrationsCount);
}

export function ticketStateOf({
  rideStatus,
  seatsLeft,
  isRegistered,
  isWaitlisted,
}: {
  rideStatus: RideStatus;
  seatsLeft: number | null;
  isRegistered: boolean;
  isWaitlisted: boolean;
}): TicketState {
  if (rideStatus === 'cancelled') return 'cancelled';
  if (isRegistered) return 'registered';
  if (isWaitlisted) return 'waitlisted';
  switch (rideStatus) {
    case 'registration_open':
      if (seatsLeft === 0) return 'full';
      if (seatsLeft !== null && seatsLeft <= LOW_SEATS_THRESHOLD) return 'few';
      return 'open';
    case 'registration_closed':
      return 'closed';
    case 'started':
      return 'started';
    case 'finished':
      return 'finished';
    default:
      return 'notOpen';
  }
}

/**
 * The cover's status chip — the discovery card's derivation (CR-144): an open
 * ride with few or no seats reads «Мало мест» / «Список ожидания» instead of
 * the plain «Регистрация открыта».
 */
export function posterStatusTerm(
  rideStatus: RideStatus,
  seatsLeft: number | null,
): { label: string; tone: StatusTone } {
  if (rideStatus === 'registration_open' && seatsLeft !== null) {
    if (seatsLeft === 0) {
      return { label: RIDE_DISCOVERY_TERMS.waitlistStatusLabel, tone: 'info' };
    }
    if (seatsLeft <= LOW_SEATS_THRESHOLD) {
      return { label: RIDE_DISCOVERY_TERMS.lowSeatsLabel, tone: 'warning' };
    }
  }
  return RIDE_STATUS_TERMS[rideStatus];
}

/**
 * The ticket's status chip (QA live audit 2026-10-08, item 2). The viewer's
 * own place wins over the ride's seats, the same rule as `ticketStateOf`: a
 * registered viewer on a full ride holds a confirmed seat, not a place in
 * «Список ожидания» — the seats figure on the card already says the ride is
 * full. Once the ride is under way or over, its progress is the news.
 */
export function ticketStatusTerm(
  state: TicketState,
  rideStatus: RideStatus,
  seatsLeft: number | null,
): { label: string; tone: StatusTone } {
  if (
    state === 'registered' &&
    rideStatus !== 'started' &&
    rideStatus !== 'finished'
  ) {
    return { label: RIDE_TICKET_TERMS.registeredStatus, tone: 'success' };
  }
  if (state === 'waitlisted') {
    return { label: RIDE_TICKET_TERMS.waitlistLabel, tone: 'info' };
  }
  if (state === 'registered') return RIDE_STATUS_TERMS[rideStatus];
  return posterStatusTerm(rideStatus, seatsLeft);
}
