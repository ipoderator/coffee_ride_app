# Current task — CR-200: KI-087 / KI-088 / KI-082 — DONE (committed)

Source: owner — "бери все 3 первых" (next-steps list after CR-199). Branch `main`.

## Goal

1. KI-087: the six remaining destructive `window.confirm`s (avatar ×2, ride cover,
   GPX route, route point, stop) → `ConfirmDialog`, same as CR-195's ride cancel.
2. KI-088: regenerate `discovery-map-chromium-linux.png` (stale since KI-078/CR-185).
3. KI-082: its status line/CR-188 paragraph belong to KI-084 (closed); correct the
   record — the probe-host issue itself is an accepted limitation guarded weekly.

## Acceptance criteria

- No `window.confirm` left in `apps/web/src`; each delete opens the app's dialog
  (title + description + «Удалить…»/«Не удалять»), dismiss = no request, confirm =
  delete; duplicate-submit protected (`isConfirming`).
- Unit tests and e2e drive the dialog, not `vi.spyOn(window, 'confirm')` /
  `page.once('dialog')`; stories cover the open dialog with axe.
- KI-088 baseline regenerated on x86_64 (Docker amd64, or the CI-artifact path) and
  showing no expand button over the notice.
- known-issues updated/archived.

## Progress

- [x] KI-087 terms + components
- [x] KI-087 tests/stories/e2e
- [x] KI-088 baseline — amd64 pull stalled (2/7 layers, 10 min, stopped); owner chose
      the temporary branch + draft PR path (#28, closed, branch deleted). CI run
      37147345143's actual drops only the expand button → committed as the baseline.
- [x] KI-082 record
- [x] validation, docs (changelog/tasks/project-state)

## Validation

web unit 772/772; ui 246/246; web+ui typecheck/lint clean; Storybook 196/196 (axe);
e2e media-uploads/route-points-stops/gpx-route 10/10 (local stack + S3).

## Final result

KI-087 and KI-088 closed (archived), KI-082 corrected. Committed and pushed.
