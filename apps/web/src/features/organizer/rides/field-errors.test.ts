import { describe, expect, it } from 'vitest';
import { RIDE_CONTACT_VALUE_ERRORS, VALIDATION_TERMS } from 'ui';
import { rideFieldShapeError } from './field-errors';

describe('rideFieldShapeError (KI-085)', () => {
  it('names the rule each ride field’s shape check enforces', () => {
    expect(rideFieldShapeError('startsAt', '')).toBe(VALIDATION_TERMS.startsAt);
    expect(rideFieldShapeError('startTimezone', '')).toBe(
      VALIDATION_TERMS.timeZone,
    );
    expect(rideFieldShapeError('startLat', '')).toBe(
      VALIDATION_TERMS.startPoint,
    );
    expect(rideFieldShapeError('startLng', '')).toBe(
      VALIDATION_TERMS.startPoint,
    );
  });

  it('asks for the format of the contact type the organizer picked', () => {
    expect(rideFieldShapeError('contact', 'telegram')).toBe(
      RIDE_CONTACT_VALUE_ERRORS.telegram,
    );
    expect(rideFieldShapeError('contact', 'max')).toBe(
      VALIDATION_TERMS.russianPhone,
    );
    expect(rideFieldShapeError('contact', '')).toBeUndefined();
  });

  it('has nothing of its own for a plain field', () => {
    expect(rideFieldShapeError('title', 'phone')).toBeUndefined();
    expect(rideFieldShapeError(3, 'phone')).toBeUndefined();
  });
});
