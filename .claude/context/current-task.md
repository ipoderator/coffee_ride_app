# Current task — CR-199: notification times in the ride's timezone — DONE (committed)

Source: owner report — the same ride update shows 16:01 (MSK) in the organizer journal
and 13:01 (UTC) in «Мои заезды → Уведомления». Branch `main`.

## Goal

`NotificationList` reads each card's date/time in the ride's `startTimezone`.

## Acceptance criteria

- Europe/Moscow ride → MSK time, not UTC. — done.
- Date follows the ride zone when it differs from the UTC date. — done.
- Other notification types and feed states unchanged. — done.
- Zone delivered by the API: additive `Notification.ride.startTimezone` (already
  selected for `reschedule`; no new query). — done.

## Files

`packages/types/src/domain/notification.ts`; `apps/api/src/modules/notifications/
{notification-response.schema,notifications.service,notifications.routes.test}.ts`;
`apps/web/src/features/participant/notifications/{components/NotificationList.tsx,
notifications.test.tsx}`; `apps/web/src/stories/NotificationList.stories.tsx` (new);
`docs/api.md`, changelog, tasks, project-state.

## Validation

web unit 771/771 (4 new; all fail on the old component); web/api/types typecheck +
lint clean; api notifications/registrations/rides 391 passed, 5 skipped (opt-in live);
Storybook NotificationList 5/5 with axe.

## Final result

Implemented, validated, committed and pushed.
