import type { Registration } from '../domain/registration.js';
import type { WaitlistEntry } from '../domain/waitlist-entry.js';

// CR-032 ("Register"). `POST /v1/rides/:id/register` takes no request body — identity
// (who) and target (which ride, from the path) are all it needs, same shape as
// `publish`/`open-registration`/etc. `DELETE /v1/rides/:id/register` (cancel) returns
// `204` with no body, so it has no response type here.
export interface CreateRegistrationResponse {
  registration: Registration;
}

// CR-036 ("Waitlist"). `POST /v1/rides/:id/waitlist` takes no request body, same shape
// as `CreateRegistrationResponse`. `DELETE /v1/rides/:id/waitlist` (leave) returns
// `204` with no body, so it has no response type here either.
export interface CreateWaitlistEntryResponse {
  waitlistEntry: WaitlistEntry;
}
