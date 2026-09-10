# REST API Contract

## Auth
POST `/auth/register`
POST `/auth/login`
POST `/auth/logout`
GET `/auth/me`
POST `/auth/verify-email`
POST `/auth/forgot-password`
POST `/auth/reset-password`

## Rides
GET `/rides`
GET `/rides/:id`
POST `/rides`
PATCH `/rides/:id`
POST `/rides/:id/publish`
POST `/rides/:id/close-registration`
POST `/rides/:id/cancel`
POST `/rides/:id/finish`

## Registration
POST `/rides/:id/register`
DELETE `/rides/:id/register`
GET `/rides/:id/participants`
POST `/rides/:id/waitlist`
DELETE `/rides/:id/waitlist`

## Route
POST `/rides/:id/route`
PATCH `/rides/:id/route`
DELETE `/rides/:id/route`
POST `/rides/:id/stops`
PATCH `/rides/:id/stops/:stopId`
DELETE `/rides/:id/stops/:stopId`

## Updates
POST `/rides/:id/updates`
GET `/rides/:id/updates`

## Reviews
POST `/rides/:id/reviews`
GET `/rides/:id/reviews`

## Health
GET `/health` — reports DB/Redis/S3 status; must not fail hard if one dependency is
degraded (CR-051, `.claude/rules/resilience.md`).

Rules:
- protected endpoints require auth;
- organizer mutations require ownership;
- input is runtime validated;
- errors use a consistent shape;
- participant data is minimized;
- auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`) carry a
  stricter rate limit than the general API (`.claude/rules/security.md`);
- `/auth/forgot-password` and `/auth/verify-email` responses do not reveal whether the
  target email exists.
