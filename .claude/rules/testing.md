# Testing Rules

Test behavior, not implementation details.

## Unit/integration

Cover:

- ride lifecycle;
- organizer ownership;
- registration;
- duplicate registration;
- full ride;
- waitlist;
- cancellation;
- authorization;
- route/stops persistence.

## Security (`.claude/rules/security.md`)

Cover:

- login/register happy path and generic-error-on-failure behavior (no account
  enumeration);
- password reset: token validity, single-use, expiry;
- rate limiting on auth endpoints actually rejects beyond the threshold;
- an authenticated-but-not-owner request is rejected (not just an unauthenticated one);
- no endpoint returns more participant data than the caller's capability allows.

## Resilience (`.claude/rules/resilience.md`)

Cover, at least for the 2GIS adapter and any queued notification job:

- a timed-out/failing external call degrades per the documented fallback instead of
  failing the whole request;
- a queued side-effect job failing does not roll back or block the action that
  triggered it;
- retries are only exercised for idempotent operations.

## Maps adapter (`.claude/rules/maps.md`)

When more than one `packages/maps-*` adapter exists, run the same geocode/reverse-geocode/
route-building test cases against each implementation to verify interface parity, not
just that the currently-active one works.

## Extensibility / regression (`.claude/rules/extensibility.md`)

Any change to `packages/ui`, `packages/types`, or a shared API contract needs its tests
run against both the organizer and participant cabinets, not just the one being worked on
— that's what actually catches "feature N+1 broke feature N."

## E2E

Critical journeys:

- participant discovers and registers;
- organizer creates/publishes ride;
- organizer views participants.

Every bug fix should add regression coverage when practical.

A failing test is a development problem to investigate, not something to bypass.
