import { z } from 'zod';
import type { Registration } from '../domain/registration.js';
import type { WaitlistEntry } from '../domain/waitlist-entry.js';
import type { PublicRide } from './rides.js';
import type { Paginated } from './pagination.js';

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

// CR-037 ("Organizer participant list", `.claude/context/current-task.md`). Own
// shape, not `Registration`/`WaitlistEntry` (`docs/api.md`'s own note that this
// endpoint "will need its own waitlist-visibility design") — deliberately minimal:
// enough to identify who's who in an organizer's list, no phone/email
// (`.claude/rules/security.md` "protect participant contact... information";
// `packages/db/src/schema/user.ts`'s `phone` comment names this exact endpoint as
// the constraint to preserve). One shape reused for both the participants and the
// waitlist collection — same fields either way, only the underlying filter differs
// server-side.
export interface RideParticipantSummary {
  id: string;
  userId: string;
  displayName: string | null;
  createdAt: string;
}

export type ListRideParticipantsResponse = Paginated<RideParticipantSummary>;
export type ListRideWaitlistResponse = Paginated<RideParticipantSummary>;

// CR-091 ("My registrations", `.claude/context/current-task.md`): `GET
// /v1/registrations/mine` — the caller's own active registrations, each joined with
// its ride's public+organizer summary. `ride: PublicRide` reuses the exact type
// `GET /v1/rides` (discovery) and `GET /v1/rides/mine` (organizer) already export,
// instead of minting a third ride-summary shape (`.claude/CLAUDE.md`: "Do not create
// duplicate concepts under different names").
export interface MyRegistrationSummary {
  registration: Registration;
  ride: PublicRide;
}

// `when` is required, not a default-to-"all" filter — same "explicit, not a default
// that changes response shape" discipline `bicycleType` already uses for discovery.
// Deliberately not extending `listRidesQuerySchema` (that lives in `./rides.js` and
// is about ride collections, not this one) — same `limit`/`cursor` shape, defined
// locally to keep this module's own query schema self-contained.
export const myRegistrationsQuerySchema = z.object({
  when: z.enum(['upcoming', 'past'], 'when must be either upcoming or past.'),
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
});
export type MyRegistrationsQuery = z.infer<typeof myRegistrationsQuerySchema>;

export type ListMyRegistrationsResponse = Paginated<MyRegistrationSummary>;
