### KI-079 — Ride-detail visual baselines are stale after CR-155

Status: resolved 2026-10-01 (CR-161 follow-up). Discovered: 2026-09-29 (CR-155).
Problem: CR-155 rebuilt `/rides/[id]`'s layout (hero beside the ticket, new ticket,
timeline, profile and requirements sections), so the `ride-detail` screenshots in
`apps/web/e2e/visual-regression.spec.ts-snapshots/` (chromium + mobile) no longer
match by design. They can't be regenerated on macOS (`.claude/rules/testing.md`).
Impact: CI's e2e step fails on those screenshots until refreshed; functional e2e
passed locally (39/39 non-visual).
Next action: after the push, download the failed run's `playwright-report`
artifact, check each `*-diff.png` shows only the CR-155 change, commit the
`*-actual.png` files as the new baselines (same procedure as KI-077).
Resolution: CI couldn't produce the actuals until CR-161 unblocked the coverage
gate. Run `36856168437` (`ed3c1a3`): only `ride-detail` chromium failed (14 %
of pixels — the CR-155 layout and «Все заезды» back link, nothing else);
`ride-detail` mobile and every other screenshot passed. Its `*-actual.png`
committed as the new chromium baseline.
