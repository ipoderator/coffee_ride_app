import { describe, expect, it } from 'vitest';
import { posterStatusTerm, seatsLeftOf, ticketStateOf } from './ticket-state';

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
