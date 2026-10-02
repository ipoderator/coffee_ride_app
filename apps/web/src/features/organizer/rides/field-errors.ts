import type { RideContactType } from 'types';
import { RIDE_CONTACT_VALUE_ERRORS, VALIDATION_TERMS } from 'ui';

/**
 * KI-085: a ride form field's own wording for a shape rule — the `specific`
 * of `fieldErrorMessage` — by the issue path's first segment. `contactType`
 * is what the organizer picked, so a bad value says which format it wants.
 */
export function rideFieldShapeError(
  field: unknown,
  contactType: RideContactType | '',
): string | undefined {
  switch (field) {
    case 'startsAt':
      return VALIDATION_TERMS.startsAt;
    case 'startTimezone':
      return VALIDATION_TERMS.timeZone;
    // `startLat`/`startLng` must come together (`updateRideRequestSchema`).
    case 'startLat':
    case 'startLng':
      return VALIDATION_TERMS.startPoint;
    case 'contact':
      return contactType ? RIDE_CONTACT_VALUE_ERRORS[contactType] : undefined;
    default:
      return undefined;
  }
}
