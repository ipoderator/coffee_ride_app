# Current Task

## Task ID

CR-038/CR-039/CR-040/CR-041 — Communication (registration confirmation, ride
updates, cancellation notification, in-app notifications)

## Goal

Close `docs/tasks.md`'s Communication section: an organizer's ride actions
(register-confirmed, updates sent, ride cancelled) become in-app notifications a
participant can read at `/me/notifications` (`docs/design.md` §8).

## Requirements

- `docs/product.md`: participant "receive updates"; organizer "send updates".
- `docs/design.md` §8: `/organizer/rides/[id]/updates` (ride updates composer),
  `/me/notifications` (CR-041, in-app notifications).
- `docs/decisions.md` ADR-007 (Notifications): **Pending** — "Start with in-app
  notifications; external provider later behind an adapter." No email/push in this
  ticket.
- `.claude/CLAUDE.md` domain entities: `RideUpdate` (organizer message),
  `Notification` (delivery record) — both new tables.
- `.claude/rules/resilience.md`: notification side effects must not be able to fail
  or roll back the critical action that triggered them (registration, cancellation,
  ride cancellation).

## Scope decisions (made before implementing)

- **Four tickets bundled into one DB/module unit**, same precedent as CR-032..035:
  CR-038/040 are single-recipient producers, CR-039 is a fan-out producer, CR-041 is
  the one consumer — none is independently useful without the `notifications` table
  CR-041 reads.
- **Notification types, one enum, mapped 1:1 to the three producer tickets**:
  `registration_confirmed` (CR-038 — also reused for a waitlist promotion, since
  that's the same "you are now registered" event, not a fourth type),
  `ride_update` (CR-039), `ride_cancelled` (CR-040, the _organizer cancels the whole
  ride_ action, CR-021 — not a participant cancelling their own registration,
  CR-033, which needs no notification since it's the actor's own action on
  themselves).
- **Fan-out scope is active registrations only, not waitlist entries** — same
  "registrations are the participant list; waitlist is separate" precedent CR-037/
  CR-091 already established. `docs/product.md` never distinguishes the two for
  "receive updates" either way, so this stays consistent rather than inventing a
  wider rule.
- **Delivery mechanism: a plain DB insert, in the same request, after (not inside)
  the triggering transaction — not a Redis queue.** `.claude/rules/resilience.md`
  names Redis for decoupling, but that's CR-050 ("Async notification delivery via
  Redis queue"), a distinct, not-yet-built backlog item, and Redis has never been
  live-verified in this environment (KI-014). In-app notifications are a same-
  database insert, not a call to an external provider (ADR-007 is explicit that the
  external-provider adapter is a later step) — so the resilience principle that
  actually applies today is narrower: "never let the side effect roll back or fail
  the critical action," not "queue it through Redis." Implementation: the
  triggering transaction (registration, cancellation-with-promotion, ride
  cancellation) commits first; notification creation happens in a separate
  `try/catch` step immediately after, with a failure logged (`request.log.error`)
  and swallowed, never surfaced as a failure of the triggering endpoint. This is
  documented as an interim posture in `known-issues.md`, same shape as KI-022's
  "narrower than the full rule, not a regression" framing — CR-050 is the ticket
  that upgrades this to a real queue if/when notification volume or an external
  channel justifies it.
- **`ride_updates`/`notifications` live in a new `notifications` capability
  module** (`.claude/rules/architecture.md`'s feature-boundary list already names
  `notifications`), not folded into `rides`/`registrations` — `RideUpdate`'s only
  purpose is triggering `Notification` rows, and both are one cohesive read/write
  surface. `POST`/`GET /v1/rides/:id/updates` nest under the existing `/rides`
  prefix (same "own module, shared URL prefix" pattern `registrationsRoutes`
  already uses), `GET /v1/notifications/mine` + `POST /v1/notifications/:id/read`
  get their own `/notifications` prefix (same reasoning `myRegistrationsRoutes`
  used for not colliding with `/rides/mine`).
- **`GET /v1/rides/:id/updates` (ride-update history) is organizer-only**, same
  `assertOwnRide` gate as CR-037's `/participants`/`/waitlist` — `docs/design.md`
  names no participant-facing updates feed on `/rides/[id]`; a participant reads
  updates via `/me/notifications` only. `POST` (compose) has no ride-status gate
  beyond ownership — sending an update on a ride with zero active registrations is
  harmless (zero notifications created), not an error worth inventing a 409 for.
- **`Notification` embeds a minimal `{ id, title }` ride reference and the
  `RideUpdate.message` text when present**, joined at read time — no denormalized
  copy of the ride title. Safe because every producer only fires on a non-`draft`
  ride, and `Ride.title` is immutable past `draft` (`updateRideDraft` is
  draft-only), so there's no "notification shows a since-edited title" risk to
  guard against.
- **Mark-as-read is per-notification, not "mark all read"** — no design-doc UI
  specifies a bulk action; a single `POST /v1/notifications/:id/read` is the
  minimal real thing `/me/notifications` needs (click a card, it's read).
- **No unread-count badge on the nav item this ticket** — `docs/design.md` §8's
  nav entry is plain text like every other cabinet nav item; a badge/counter isn't
  named anywhere and would be new shared-component surface
  (`.claude/rules/extensibility.md` regression discipline) without a spec to build
  it against. `readAt` is already exposed per-item, so a future ticket can add a
  count without a schema change.

## Acceptance criteria

- Registering for a ride (or being auto-promoted from the waitlist) creates a
  `registration_confirmed` notification for that user; a failure inserting it never
  fails the registration/promotion itself.
- `POST /v1/rides/:id/updates` (organizer-only, `404 ride_not_found` otherwise)
  creates a `RideUpdate` and fans out a `ride_update` notification to every
  currently-active registrant; `GET /v1/rides/:id/updates` lists an organizer's own
  ride's update history, paginated (ADR-011).
- Cancelling a ride (`POST /v1/rides/:id/cancel`) fans out a `ride_cancelled`
  notification to everyone who was actively registered at cancellation time.
- `GET /v1/notifications/mine` (paginated, `createdAt desc`) returns only the
  caller's own notifications; `POST /v1/notifications/:id/read` sets `readAt`,
  404s for a notification that doesn't exist or belongs to someone else.
- `/organizer/rides/[id]/updates` (compose + history) and `/me/notifications`
  (list, unread visually distinguished, click-to-read) both ship with the five
  required states (`docs/design.md` §10); new links/nav entries reach them
  (organizer link from `EditRideForm`, same pattern as "Участники →"/"Маршрут →";
  participant nav item, same registry pattern as `myRegistrationsNavItem`).
- `turbo typecheck`/`lint`/relevant `test` pass; no unrelated changes.

## Planned files

- `packages/db/src/schema/ride-update.ts`, `notification.ts` (+ `index.ts`
  exports), a new migration.
- `packages/types/src/domain/ride-update.ts`, `notification.ts`,
  `api/notifications.ts` (+ `index.ts` exports).
- `apps/api/src/modules/notifications/` (new module): `notifications.service.ts`
  (`createNotification`, `createRideUpdate`, `listRideUpdates`,
  `listMyNotifications`, `markNotificationRead`), `notifications.routes.ts`,
  `notification-response.schema.ts`, `notifications.routes.test.ts`.
- `apps/api/src/modules/registrations/registrations.service.ts` — call
  `createNotification` after `createRegistration` commits and after the
  waitlist-promotion branch inside `cancelRegistration` commits.
- `apps/api/src/modules/rides/rides.service.ts` — call the fan-out after
  `cancelRide` commits.
- `apps/api/src/routes/v1.ts` — register the new plugin(s).
- `docs/api.md` — document the new endpoints.
- `apps/web/src/features/organizer/updates/` (new): `api.ts`,
  `components/UpdateComposer.tsx`, `updates.test.tsx`.
- `apps/web/src/app/organizer/rides/[id]/updates/page.tsx`.
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx` — new
  "Обновления →" link.
- `apps/web/src/features/participant/notifications/` (new): `api.ts`, `nav.ts`,
  `components/NotificationList.tsx`, `notifications.test.tsx`.
- `apps/web/src/app/me/notifications/page.tsx`.
- `apps/web/src/lib/cabinet/participant-nav.ts` — register the new nav item.
- `packages/ui/src/terminology.ts` — new terms.
- `.claude/context/known-issues.md` — new entry documenting the interim
  (non-queued) notification-delivery posture, pointing at CR-050.

## Implementation progress

- [x] DB schema + migration
- [x] `packages/types`
- [x] `apps/api` notifications module + wiring into registrations/rides
- [x] `docs/api.md`
- [x] `apps/web` organizer updates composer
- [x] `apps/web` participant notifications list
- [x] Validation pass (typecheck/lint/test/build)
- [x] Context/changelog/tasks update

## Validation results

- `turbo run lint typecheck test`: 19/19 tasks passed (`apps/api` 242 tests, +16
  new; `apps/web` 147 tests, +11 new; `packages/ui` 85 tests unchanged;
  types/db/maps-* typecheck/build).
- `NODE_ENV=production turbo run build`: all 6 build tasks pass, both new routes
  (`/me/notifications`, `/organizer/rides/[id]/updates`) present in `web:build`'s
  route list.
- Live curl verification against a real Postgres + running `apps/api`:
  registering created a `registration_confirmed` notification; a waitlist
  auto-promotion notified the promoted user, not the cancelling one; an
  organizer's update fanned out to the one active registrant with the correct
  message/ride title; cancelling the ride fanned out `ride_cancelled` to the
  same registrant; marking a notification read was idempotent; a stranger got
  `404 notification_not_found` trying to mark someone else's notification read.
  Scratch data deleted afterward, confirmed by a direct count query.

## Discovered issues

- A waitlist-promotion test initially failed because `PATCH` (setting
  `participantLimit`) is draft-only — the test had opened registration before
  patching capacity. Fixed by reordering the test (`openRegistration: false`,
  patch, then publish/open-registration manually), not a product-code bug.

## Final result

Done. `docs/tasks.md`'s Communication section (CR-038..041) is now fully
complete. `.claude/context/project-state.md`, `docs/changelog.md`,
`.claude/context/architecture-map.md`, and `.claude/context/known-issues.md`
(new KI-040, documenting the interim non-queued notification-delivery posture)
all updated. Next logical task: Post-ride (CR-042 Review, CR-043 Organizer
rating summary).
