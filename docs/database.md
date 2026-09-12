# Database Model

Conceptual model. Exact columns and indexes evolve through migrations.

- User — account.
- OrganizerProfile — public organizer data linked to User.
- Ride — cycling event owned by OrganizerProfile.
- Route — route geometry and metadata.
- RoutePoint — start/finish/stop/danger/water/food/technical/other.
- Stop — named planned stop with location and duration.
- RideRequirement — participation rules.
- RideService — included logistics/services.
- Registration — User ↔ Ride.
- WaitlistEntry — user waiting for a place.
- RideUpdate — organizer message.
- Notification — delivery record.
- Review — participant feedback.

Important invariants:
- ride has organizer;
- active duplicate registration is forbidden;
- capacity is server-side and atomic;
- private participant data is restricted.

## Time

See `docs/decisions.md` → ADR-012.

- every timestamp column is `timestamptz`, never bare `timestamp`;
- `Ride` additionally stores the IANA timezone of its start location
  (`Europe/Moscow`, `Asia/Krasnoyarsk`, …) — the instant answers "has it started",
  the zone answers "what does the organizer's 08:00 mean". Store the identifier,
  never a fixed offset.

Use migrations for every schema change.
