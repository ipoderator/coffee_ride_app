# Current task

## CR-165 — Organizer contact method on a ride (optional, per-ride)

Status: **in progress** (2026-10-01).

### Goal

The organizer may optionally provide one way to be contacted about a specific
ride. Owner's decisions (asked 2026-10-01):

1. **Visibility: registered participants only** (+ the organizer themselves).
   Anonymous visitors and signed-in non-participants never receive it.
2. **Storage: per-ride** (columns on `rides`), not on `OrganizerProfile` —
   a different ride may carry a different contact, or none.
3. **Types: `telegram`, `max`, `phone`, `email`** (MAX = the Russian
   messenger max.ru).

### Requirements

- Optional: a ride with no contact is valid and is the default.
- `contactType` + `contactValue` are set together or both absent (DB CHECK).
- Per-type validation (Zod + DB CHECK where practical):
  - `phone` — Russian format, stored normalized `+7XXXXXXXXXX`;
  - `telegram` — `@username`, stored without the `@`;
  - `max` — a phone number (MAX is phone-based), same normalization;
  - `email` — a valid address.
- Settable at **create** and in the **edit draft** form, and editable after
  publish (same reasoning as KI-065's `participantsVisible`: a contact going
  stale after publication is exactly when it must be fixable).
- The API must **omit the field entirely** for callers who may not see it —
  not send it and hide it in the UI.

### Acceptance criteria

- [ ] Migration adds `contact_type` (pg enum) + `contact_value`, both nullable,
      with a CHECK that they are both-null or both-set.
- [ ] `GET /v1/rides/:id` includes `contact` only for an active registrant or
      the owning organizer; absent for everyone else.
- [ ] Create + edit forms expose it; «не указывать» is the default.
- [ ] Ride detail renders it for a registered participant as an actionable
      link (tel:/https://t.me/…/mailto:) with the brand tokens, never a raw hex.
- [ ] Tests: authz (anonymous/non-participant/participant/organizer),
      validation per type, both-or-neither invariant.
- [ ] typecheck + lint + unit green; Storybook check per the standing rule.

### Planned files

- `packages/db/src/schema/ride.ts` + new migration
- `packages/types/src/domain/ride.ts`, `packages/types/src/api/rides.ts`
- `apps/api/src/modules/rides/{rides.service,rides.routes,ride-response.schema}.ts`
- `apps/web/src/features/organizer/rides/components/{CreateRideForm,EditRideForm}.tsx`
- `apps/web/src/features/participant/ride-detail/components/RideDetailView.tsx`
- `packages/ui/src/terminology.ts` (Russian strings), formatter for display

### Progress

- [x] Context read, precedent (`participantsVisible`, CR-125) traced
- [ ] Implementation

### Result

**Done, validated** (2026-10-01). All acceptance criteria met except the
post-publish editing UI, deliberately deferred as KI-081 (the edit screen is
read-only for a non-draft ride by design; the `PUT` endpoint exists and is
tested). Details in `docs/changelog.md` → CR-165.

Owner decisions applied: visibility = registered participants only; storage =
per-ride; types = phone/telegram/max/email.

Validation: `pnpm typecheck` 8/8, `pnpm lint` 9/9, `apps/api` 529 passed /
8 skipped, `apps/web` unit 501 passed, `packages/ui` 208 passed,
`test:storybook` 69 passed. Verified end to end on the running dev stack
(anonymous → hidden, signed-in non-participant → hidden, registered → visible
link), both themes, plus the Storybook stories.

Note: the dev database (`coffee_ride_dev`) is separate from the test database
and needed the migration applied separately — both are migrated now.
