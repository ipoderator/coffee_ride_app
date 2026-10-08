import { describe, expect, it } from 'vitest';
import {
  posterStatusTerm,
  seatsLeftOf,
  ticketStateOf,
  ticketStatusTerm,
} from './ticket-state';

const base = { isRegistered: false, isWaitlisted: false };

describe('ticketStateOf (CR-151)', () => {
  it('derives open / few / full from the seats left of an open ride', () => {
    const open = { ...base, rideStatus: 'registration_open' as const };
    expect(ticketStateOf({ ...open, seatsLeft: null })).toBe('open');
    expect(ticketStateOf({ ...open, seatsLeft: 4 })).toBe('open');
    expect(ticketStateOf({ ...open, seatsLeft: 3 })).toBe('few');
    expect(ticketStateOf({ ...open, seatsLeft: 0 })).toBe('full');
  });

  it("puts the viewer's own state before the ride's, except cancelled", () => {
    expect(
      ticketStateOf({
        rideStatus: 'registration_closed',
        seatsLeft: 0,
        isRegistered: true,
        isWaitlisted: false,
      }),
    ).toBe('registered');
    expect(
      ticketStateOf({
        rideStatus: 'registration_open',
        seatsLeft: 0,
        isRegistered: false,
        isWaitlisted: true,
      }),
    ).toBe('waitlisted');
    expect(
      ticketStateOf({
        rideStatus: 'cancelled',
        seatsLeft: 3,
        isRegistered: true,
        isWaitlisted: false,
      }),
    ).toBe('cancelled');
  });

  it('maps the other lifecycle statuses', () => {
    const at = (
      rideStatus: Parameters<typeof ticketStateOf>[0]['rideStatus'],
    ) => ticketStateOf({ ...base, rideStatus, seatsLeft: 5 });
    expect(at('published')).toBe('notOpen');
    expect(at('registration_closed')).toBe('closed');
    expect(at('started')).toBe('started');
    expect(at('finished')).toBe('finished');
  });
});

describe('posterStatusTerm / seatsLeftOf', () => {
  it('reads an open ride with few or no seats like the discovery card', () => {
    expect(posterStatusTerm('registration_open', 2).label).toBe('Мало мест');
    expect(posterStatusTerm('registration_open', 0).label).toBe(
      'Список ожидания',
    );
    expect(posterStatusTerm('registration_open', 10).label).toBe(
      'Регистрация открыта',
    );
    expect(posterStatusTerm('cancelled', 0)).toMatchObject({
      label: 'Отменён',
      tone: 'danger',
    });
  });

  it('never goes below zero and is null without a limit', () => {
    expect(seatsLeftOf(10, 12)).toBe(0);
    expect(seatsLeftOf(null, 12)).toBeNull();
  });
});

// QA live audit 2026-10-08, item 2: a registered viewer on a full ride (their
// own registration or a waitlist promotion took the last seat) read «Список
// ожидания» on their own ticket.
describe('ticketStatusTerm', () => {
  it('shows a confirmed seat to a registered viewer on a full ride', () => {
    const state = ticketStateOf({
      rideStatus: 'registration_open',
      seatsLeft: 0,
      isRegistered: true,
      isWaitlisted: false,
    });
    expect(ticketStatusTerm(state, 'registration_open', 0)).toEqual({
      label: 'Место подтверждено',
      tone: 'success',
    });
  });

  it('shows a confirmed seat with seats left and once registration closes', () => {
    expect(ticketStatusTerm('registered', 'registration_open', 5).label).toBe(
      'Место подтверждено',
    );
    expect(ticketStatusTerm('registered', 'registration_closed', 0).label).toBe(
      'Место подтверждено',
    );
  });

  it('shows the ride under way or over to a registered viewer', () => {
    expect(ticketStatusTerm('registered', 'started', 0)).toEqual(
      posterStatusTerm('started', 0),
    );
    expect(ticketStatusTerm('registered', 'finished', 0)).toEqual(
      posterStatusTerm('finished', 0),
    );
  });

  it('keeps the queue for a waitlisted viewer, even when a seat just freed up', () => {
    expect(ticketStatusTerm('waitlisted', 'registration_open', 0)).toEqual({
      label: 'Список ожидания',
      tone: 'info',
    });
    expect(ticketStatusTerm('waitlisted', 'registration_open', 1).label).toBe(
      'Список ожидания',
    );
  });

  it("leaves every other face on the ride's own chip", () => {
    for (const [state, rideStatus, seatsLeft] of [
      ['full', 'registration_open', 0],
      ['few', 'registration_open', 2],
      ['open', 'registration_open', 10],
      ['closed', 'registration_closed', 3],
      ['notOpen', 'published', 3],
      ['started', 'started', 3],
      ['finished', 'finished', 3],
      ['cancelled', 'cancelled', 0],
    ] as const) {
      expect(ticketStatusTerm(state, rideStatus, seatsLeft)).toEqual(
        posterStatusTerm(rideStatus, seatsLeft),
      );
    }
  });
});
