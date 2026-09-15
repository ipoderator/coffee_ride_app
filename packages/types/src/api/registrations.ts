import type { Registration } from '../domain/registration.js';

// CR-032 ("Register"). `POST /v1/rides/:id/register` takes no request body — identity
// (who) and target (which ride, from the path) are all it needs, same shape as
// `publish`/`open-registration`/etc. `DELETE /v1/rides/:id/register` (cancel) returns
// `204` with no body, so it has no response type here.
export interface CreateRegistrationResponse {
  registration: Registration;
}
