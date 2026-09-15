# Coffee Ride — Product Specification

<!-- impeccable:product-schema 1 -->

## Platform

web

## Goal

A Russian platform for organized cycling rides.

## Participant

Can:

- sign up/login;
- browse/filter rides;
- view ride details;
- view route, stops, requirements and services;
- register;
- cancel registration;
- receive updates;
- view registered rides;
- review completed rides.

## Organizer

Can:

- create organizer profile;
- create/edit/publish/cancel/finish rides;
- manage registrations and waitlist;
- send updates;
- define route/stops/services/requirements.

## Ride fields

title, description, cover image, start, finish, date/time, participant limit, price, distance, duration, group pace, elevation gain, difficulty, bicycle type, age/experience requirements, helmet requirement, what to bring, route, stops, services, organizer, registration status.

## Bicycle types

road, gravel, MTB, any.

## Services

food, water, coffee, support vehicle, mechanic, medical support, transfer, bicycle transport, parking, changing room/shower.

## Lifecycle

`draft → published → registration_open → registration_closed → started → finished`

Cancellation:
`published/registration_open/registration_closed → cancelled`

## MVP

1. auth
2. organizer profile
3. ride creation/edit/publish
4. map/list discovery
5. GPX route
6. stops/services/requirements
7. registration/capacity
8. waitlist
9. participant management
10. updates/notifications
11. review

## Out of scope unless explicitly requested

- full Strava replacement;
- live GPS tracking;
- social feed;
- complex gamification;
- automatic route generation;
- AI route recommendations;
- full payment marketplace.

## Users

Every `User` is a participant by default; a `User` can additionally hold an
`OrganizerProfile` and create rides (capability-based, not a role enum — ADR-006).

Who actually organizes rides is deliberately mixed, with no priority ordering between
them (confirmed 2026-09-13): private individuals, cycling clubs, bike shops, and teams
are all expected to use the same `OrganizerProfile` path — the product does not model
"club" or "shop" as a distinct account type or give one category priority over another.

## Product Purpose

Give organized group rides in the Russian market one place to live, end to end: create a
ride, describe it fully, publish it, take registrations, and keep participants updated —
so a participant can find a ride, see everything about it, and register, without piecing
information together from elsewhere.

## Positioning

Confirmed 2026-09-13. Today, group rides in the Russian market are coordinated through
scattered, incomplete channels — VK/Telegram chats, Strava clubs, Komoot — where a given
ride's route, capacity, meeting point, and status live in different places or nowhere
structured at all, and finding rides at all means already knowing where to look.

Coffee Ride's mechanism is centralization with completeness: a single place holding every
ride, regardless of who organizes it (private individuals, clubs, shops, teams), where
each ride's full picture is visible without hunting elsewhere — the route (viewable and
downloadable as a track), how many are registered, how many spots remain, the meeting
point, and the rest of the ride's details, in the same structured record every time. The
claim a neighboring chat group or general-purpose activity platform cannot truthfully
copy is that completeness-in-one-place, not any single feature in isolation.

## Operating Context

The product is a planning tool used outdoors, frequently on a phone, sometimes in bright
sunlight or before dawn ahead of a ride (see `docs/design.md` §1, which derives its visual
direction from this). Discovery and registration are expected to happen both from a
desktop/organizer-planning context and from a phone in the field.

## Capabilities and Constraints

Confirmed functionality and terminology are captured in the legacy sections above (Ride
fields, Bicycle types, Services, Lifecycle, MVP, Out of scope) — this section records what
is explicitly still undecided rather than duplicating them.

- **Monetization/business model: undecided, not fixed for MVP** (confirmed 2026-09-13).
  The `price` field on `Ride` exists as ride information only — future work must not
  assume the platform charges a commission, processes payments, or operates a
  marketplace unless a later decision says so explicitly (`Out of scope` already excludes
  "full payment marketplace" for MVP).
- Domain entities are fixed (`.claude/CLAUDE.md`): `User`, `OrganizerProfile`, `Ride`,
  `Route`, `RoutePoint`, `Stop`, `RideRequirement`, `RideService`, `Registration`,
  `WaitlistEntry`, `RideUpdate`, `Notification`, `Review`. Do not create duplicate
  concepts under different names.
- Market/locale: Russian-language UI, Russian number/date formatting, 2GIS as the map
  provider (`.claude/rules/maps.md`) — not assumptions to revisit casually.

## Brand Commitments

- Name: "Coffee Ride". No logo/wordmark exists yet; a text wordmark in the base typeface
  is the MVP placeholder (`docs/design.md` §15).
- Voice, fixed (`docs/design.md` §13): neutral and factual, «вы» without capitalization,
  no exclamation marks, no marketing enthusiasm. Errors state what happened and what to
  do next, and never blame the user.

## Evidence on Hand

None yet. No real ride content, cover photography, testimonials, case studies, or usage
numbers exist. Future work must not fabricate any of these — cover images, participant
counts, or organizer testimonials used as examples must be marked as placeholders, not
presented as real.

## Product Principles

1. **Centralize, without picking a favorite organizer type.** One place for every ride,
   whatever its source (private individual, club, shop, team) — no category is modeled as
   more official than another.
2. **Complete ride record, not a link out.** Route (including a downloadable track),
   capacity, requirements, services, and meeting point are all present on the ride itself
   — never "see the chat for details."
3. **Live status, not stale coordination.** Registration counts and remaining capacity
   reflect the database in real time (`.claude/rules/database.md` registration
   invariants), unlike a chat thread that drifts out of date.
4. **A secondary failure never blocks a primary journey.** Registration, login, and
   viewing a ride keep working even when a non-critical dependency (maps, notifications)
   degrades (ADR-008, `.claude/rules/resilience.md`).
5. **Russian-first by default.** Language, number/date formatting, and map provider are
   chosen for the Russian market, not adapted from a global default after the fact.

## Accessibility & Inclusion

Target: WCAG 2.1 AA (`docs/design.md` §12). Minimum 44×44px touch targets are a product
requirement, not a cosmetic choice — participants use the app with cold hands and gloves
on before/during a ride.
