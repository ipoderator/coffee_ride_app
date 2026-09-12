# Coffee Ride — Product Specification

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
