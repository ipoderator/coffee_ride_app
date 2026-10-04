# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~15 entries, move all but the most recent ~8 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly,
and update the pointer line below. Routine work reads only the last 3 entries of the
_live_ file (`awk` on `^## 20`, or `tail`) — the archive exists for humans and for deep
audits (grep it by CR id), not for routine agent context. (CR-202 lowered this from ~40/~15.)

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed and why, in 1-3 sentences (≤ ~600 characters).
Contract: API/types/ui contract changes, migrations — or "none".
Files: key files/dirs touched (globs, not every test file).
Validation: commands run + pass counts, one line.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

Detail beyond that (root-cause narratives, live-verification transcripts) belongs in the
commit message body or the KI entry, not here — every agent re-reads these entries.

---

Entries before CR-198 (CR-000 through CR-197, 2026-09-09..2026-10-03) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205),
per this section's own rule.

## 2026-10-03 — CR-198 — A new reschedule date re-judges the time error at once

Summary: owner QA report `QA_REPORT_fe0b4c2` (P3): «Перенести заезд» → keep the current date and time, give a reason, «Продолжить» → «Это текущее время старта — выберите другое.» under the time. Picking another date with the same time is already a different start, but the error stayed until the next «Продолжить»: the date picker cleared only the date's own error. The time errors «текущее время» and «уже прошло» are about the date+time pair, so a date change now re-judges them against the new pair right away (`pairError`, shared with `validate`): gone when the pair is fine, replaced when it is wrong another way (today at an hour already past → «Это время уже прошло…»). An error about the time field itself («Укажите новое время старта.») stays.
Files: `apps/web/src/features/organizer/rides/{components/RescheduleRideCard.tsx,reschedule-ride-card.test.tsx}`, `apps/web/src/stories/RescheduleRideCard.stories.tsx` (`NewDateClearsUnchanged`, dark theme). No API, contract, schema or visual change.
Validation: `web` typecheck + lint clean; web unit 767/767 (three new cases; two fail on the old component); Storybook `RescheduleRideCard` 7/7 with axe.
Decisions: none.

## 2026-10-03 — CR-199 — Notification times in the ride's timezone

Summary: the same ride update showed 16:01 in the organizer's journal and 13:01 in «Мои заезды → Уведомления»: `NotificationList` formatted `createdAt` with `formatDate`/`formatTime`'s UTC default, while the journal (`UpdateComposer`) reads it in the ride's `startTimezone`. The card had no zone to use — `Notification.ride` was only `{ id, title }`, and the ride's zone travelled only inside `reschedule` (CR-190). `Notification.ride` gained an additive `startTimezone` (the API already selected `rides.startTimezone` for `reschedule`, so no new query or join), and the card's date and time are read in it — every notification type, same wall clock as the organizer.
Contract: additive — `ride.startTimezone` on every item of `GET /v1/notifications/mine` and `POST /v1/notifications/:id/read` (`docs/api.md`). No schema change, no other backend behavior change.
Files: `packages/types/src/domain/notification.ts`, `apps/api/src/modules/notifications/{notification-response.schema,notifications.service,notifications.routes.test}.ts`, `apps/web/src/features/participant/notifications/{components/NotificationList.tsx,notifications.test.tsx}`, `apps/web/src/stories/NotificationList.stories.tsx` (new — the list had no story: feed/empty/error/loading/dark), `docs/api.md`.
Validation: web unit 771/771 (four new cases — MSK not UTC, a date that differs from the UTC date, per-ride zones, every type in one feed — all four fail on the old component); web + api + types typecheck and lint clean; api `notifications`/`registrations`/`rides` 391 passed (5 opt-in live tests skipped), the routes test now asserts `ride.startTimezone`; Storybook `NotificationList` 5/5 with axe.
Decisions: none.

## 2026-10-03 — CR-201 — More project skills and a skill routing table

Summary: the owner asked which further skills the project could use, then to add them all and write down when each is called, so a run doesn't scan every skill. Eight new project skills encode procedures that kept being re-derived: `visual-baselines` (x86_64 baselines via Docker amd64 or the CI artifact — KI-077/079/084/088), `close-task` (the Context preservation protocol + three-section report in one pass), `qa-report-intake` (QA report → triaged, numbered CRs, as done for QA `13653ed`/`fe0b4c2`), `ci-triage` (failing step → known fix path), `storybook-check` (the owner's "every frontend change through Storybook" rule), `known-issue` (open/resolve a KI with verbatim archiving), `dependabot-triage` (≈20 pending Dependabot branches; majors routed to planned CRs) and `terminology-string` (Russian strings via `packages/ui/src/terminology.ts`). `.claude/CLAUDE.md`'s "Project skills" list became "Skill routing": skills by development-loop step, out-of-task situations, global skills (`simplify`, `code-review`, `engineering:debug`, `engineering:deploy-checklist`, …) and usual chains. The Stop/PreCompact hook's reminder now names `close-task`. An empty stray directory named after a failed brace expansion was removed from `.claude/skills/`.
Contract: none (harness/docs only; no app code).
Files: `.claude/skills/{visual-baselines,close-task,qa-report-intake,ci-triage,storybook-check,known-issue,dependabot-triage,terminology-string}/SKILL.md`, `.claude/CLAUDE.md`, `.claude/hooks/context-preservation-reminder.sh`, `.claude/context/project-state.md`, `docs/tasks.md`.
Validation: all eight skills load in the session's skill list; Prettier clean on the changed Markdown.
Decisions: none.
Follow-up: `.claude/rules/testing.md` names `src/stories/a11y-known-issues.ts`, which doesn't exist yet (no axe exception so far) — `storybook-check` creates it on first use.

## 2026-10-03 — CR-202 — Token economy: smaller context files, targeted reads, path-scoped rules

Summary: every task re-read ~380 KB of context (project-state 94 KB, tasks 100 KB, architecture-map 76 KB, changelog 74 KB) plus ~62 KB of always-loaded rules. Now: tasks.md keeps open + 8 recent (rest verbatim in `docs/tasks-archive.md`), architecture-map is a one-line-per-module map (old verbatim in `architecture-map-archive.md`), changelog archives at ~15 entries, CLAUDE.md prescribes slice reads, and 8 of 10 rules load only for matching paths.
Contract: none (harness/docs only).
Files: `.claude/CLAUDE.md`, `.claude/rules/*.md` (`paths:` frontmatter; `auth.md` pointer deleted; brand color → `frontend.md`, baseline stall note → `testing.md`), `.claude/commands/{next,status,plan,review}.md`, `.claude/skills/close-task/SKILL.md`, `.claude/agents/*.md` (frontmatter), `.claude/context/architecture-map{,-archive}.md`, `docs/{tasks,tasks-archive}.md`, `docs/changelog.md` + `docs/changelog-archive/2026.md` (CR-171..CR-188 moved).
Validation: Prettier clean; targeted-read commands run against the real files; `paths:` syntax checked against the Claude Code memory docs.
Decisions: none.
Follow-up: `project-state.md` (94 KB, "Current task" alone 42 KB) not yet cut to a snapshot — the rewrite was held while CR-200's uncommitted edits sit in it; draft ready, owner to confirm.

## 2026-10-03 — CR-200 — Deletes ask in the app's dialog (KI-087); KI-082's record; KI-088's baseline

Summary: avatar (×2), cover, GPX, stop and route-point deletes now open `ConfirmDialog` instead of `window.confirm`, as CR-195 did for ride cancellation (KI-087). KI-082's status was KI-084's text filed under it by CR-188 — corrected; the probe host stays an accepted limitation. KI-088: the stale `discovery-map-chromium-linux.png` passed within tolerance, so a temporary draft PR (#28) deleted it to make CI write the x86_64 actual, now the baseline.
Contract: `packages/ui` terms — `deleteConfirm` → `deleteConfirmTitle`/`deleteConfirmDescription`/`deleteKeep` in `AVATAR_TERMS`, `RIDE_COVER_TERMS`, `RIDE_ROUTE_TERMS`, `STOPS_TERMS`, `ROUTE_POINT_TERMS` (every caller updated); no API change.
Files: the six forms under `apps/web/src/features/{participant,organizer}/…` and their tests; `apps/web/e2e/{media-uploads,route-points-stops,gpx-route}.spec.ts`; stories `RideWorkspaceSections` (+4) and `AvatarUploadForm` (new); `e2e/visual-regression.spec.ts-snapshots/discovery-map-chromium-linux.png`.
Validation: web unit 772/772; ui 246/246; web+ui typecheck/lint clean; Storybook 196/196 with axe; e2e upload/route specs 10/10 locally; CI run 37147345143: the actual only drops the expand button over the notice, 57 other e2e passed.
Decisions: none.
Follow-up: none — the amd64 Playwright image still stalls here (2 of 7 layers).

## 2026-10-03 — CR-203 — `project-state.md` back to a snapshot

Summary: CR-202's held follow-up, done once CR-200 was committed. `project-state.md` went from 94 KB (its "Current task" alone 42 KB of CR history) to a ~100-line snapshot: phase, latest CRs, area one-liners, Next, key ADRs, open KIs. The old file moved verbatim to `.claude/context/project-state-archive.md`; the "Do not break" invariants moved verbatim to `.claude/context/do-not-break.md`, which the read protocol, `/review` and `close-task` now point to.
Contract: none (harness/docs only).
Files: `.claude/context/{project-state,project-state-archive,do-not-break}.md`, `.claude/CLAUDE.md`, `.claude/commands/review.md`, `.claude/skills/close-task/SKILL.md`, `docs/tasks.md`, `docs/tasks-archive.md`.
Validation: Prettier clean; CLAUDE.md's targeted-read `sed` still matches the new headings.
Decisions: none.
Follow-up: none.

## 2026-10-03 — CR-204 — Close the two context gaps CR-202/203 opened

Summary: the owner asked whether targeted reads hurt understanding. Two real gaps: a keyword grep of the "Do not break" list can miss an invariant worded differently from the task, and reading only the last 3 changelog entries misses older decisions about the area being changed. `do-not-break.md` moved to `.claude/rules/` with `paths:` on code/infra/CI, so it loads whole (~3k tokens) whenever such a file is touched; the read protocol gained a step to grep the touched files/module in the changelog and its archive.
Contract: none (harness/docs only).
Files: `.claude/rules/do-not-break.md` (moved from `.claude/context/`), `.claude/CLAUDE.md`, `.claude/commands/review.md`, `.claude/skills/close-task/SKILL.md`, `.claude/context/project-state.md`, `docs/tasks.md`, `docs/tasks-archive.md`.
Validation: Prettier clean; the history grep example run against the real changelog files.
Decisions: none.
Follow-up: none.

## 2026-10-03 — CR-205 — Security audit fixes

Summary: whole-app audit against `security.md` (no CRITICAL/HIGH). Fixed: the GPX download's `Content-Disposition` took the raw uploaded name — a Cyrillic name was a 500, a `"` added parameters; now an ASCII fallback + RFC 5987 `filename*`. Web pages got their own security headers (none before; helmet covers only the API). Verify-email/reset-password tokens are claimed by a checked guarded UPDATE — concurrent resets with one token all succeeded. fastify 5.12.5 + in-range transitive bumps; Dependabot alerts enabled on GitHub.
Contract: `GET /v1/rides/:id/route/download`'s `Content-Disposition` now carries `filename*`; no other API/types change.
Files: `apps/api/src/lib/content-disposition{,.test}.ts` (new), `apps/api/src/modules/rides/{rides.routes,route.routes.test}.ts`, `apps/api/src/modules/auth/{auth.service,auth.routes.test}.ts`, `apps/web/next.config.ts`, `apps/web/e2e/security-headers.spec.ts` (new), `apps/api/package.json`, `pnpm-lock.yaml`, `.claude/rules/{security,do-not-break}.md`.
Validation: api vitest 599 passed/8 skipped (the reset race test fails on the old code: 4×200); api+web typecheck/lint clean; e2e security-headers + home/critical-journeys/gpx-route/password-reset 13/13; `pnpm audit --prod` 16 → 4.
Decisions: no script/style CSP on pages (Next inline scripts, 2GIS MapGL unverified); `/register`'s 409 (account existence) kept — rate-limited, a UX trade-off.
Follow-up: KI-090 — the 4 remaining advisories are Next 15's pinned postcss 8.4.31 (build-time only); fixed by the Next 16 upgrade (Dependabot #22).

## 2026-10-04 — CR-206 — ponytail-audit low-risk cleanups

Summary: installed the `ponytail` plugin globally and ran its whole-repo over-engineering audit. Applied only the findings that cannot change behavior: `class-variance-authority` (declared in `apps/web`, zero references repo-wide) and `clsx`/`tailwind-merge` dropped from `apps/web` (the only `cn()` lives in `packages/ui`, which declares both itself; `apps/web/src/lib/utils.ts` just re-exports it). `formatPriceParts` inlined into `formatPrice` — the one `*Parts` helper of ten with no caller outside `format.ts`.
Contract: none. No API, types, DB or user-visible string change.
Files: `apps/web/package.json`, `packages/ui/src/{format,format.test}.ts`, `pnpm-lock.yaml`.
Validation: ui vitest 245 passed, web unit 772 passed, storybook 196 passed (render+play+axe); typecheck/lint/format clean; `pnpm build` 7/7; built API smoke-tested live — `/health` 200 with `db: ok`.
Decisions: `postgres` stays a direct `apps/api` dependency — removed it first, then restored it: `scripts/build.mjs` documents that esbuild inlines `packages/db`'s source, so the bundle itself requires `postgres`, and pnpm only symlinks a package's own declared deps. `pnpm build` passes either way; only the `node dist/server.js` smoke test catches it. `apps/web/src/lib/utils.ts` kept despite 0 importers — `components.json`'s `aliases.utils` points at it, so removing it would break `shadcn add`.
Follow-up: the audit's `uploadRoute`/`replaceRoute` (~25 shared lines) and `uploadCoverImage`/`replaceCoverImage` (~40) duplication is left as-is — a logic change in the upload paths, not a low-risk cleanup. `apps/web/coverage/` is committed to the tree; check `.gitignore` if unintended.

## 2026-10-04 — CR-207 — Toast timers cleared on unmount (CI red with every test passing)

Summary: `ci` was failing on `web#test:coverage` while all 772 tests passed — Vitest exited 1 on an unhandled `ReferenceError: window is not defined`. `ToastProvider` scheduled two bare `setTimeout`s per toast and never cleared them, so a toast shown shortly before unmount fired `setToasts` after jsdom was torn down (and, in the browser, updated an unmounted component). Timers are now tracked in a ref and cleared on unmount; `schedule()` also drops a fired id so a long-lived provider doesn't accumulate them. Timing-dependent, so CI-only: the same error already failed run 37149360054 (`e9e0ee8`) before CR-206.
Contract: none.
Files: `packages/ui/src/components/Toast{,.test}.tsx`.
Validation: ui 246 passed (the new test fails on the old code — `expected 1 to be +0`), web coverage 772 passed with no `Errors` line, storybook 196 passed; typecheck 8/8, lint 9/9, format clean. `packages/ui` coverage 99.58 % statements vs the 99.57 % floor — no baseline update.
Decisions: fixed in `ToastProvider` rather than by making the test unmount-safe — the leak was real at runtime too, not a test artifact.
Follow-up: full `pnpm coverage:check` not run (needs live Postgres/Redis/S3; Docker was down). `gh run watch --exit-status` exited 0 on a failed run — check `gh run view --json conclusion` instead. The red Dependabot runs (zod, next, lucide-react, tailwind-merge) share this cause and should clear.

## 2026-10-04 — CR-209 — auth coverage gate reddened `ci` on commits that changed no code

Summary: `main` failed the coverage gate at `463a86b`, a markdown-only commit, with the auth scope at 95.16/94.74/80.30 against a 95.59/95.06/80.64 floor — the same numbers four Dependabot PRs showed. CR-208 read that as a `push` vs `pull_request` difference; wrong — the push run fails identically. The real cause: CR-205's two single-use-token tests race four real requests at one token, and a loser can be rejected by the pre-check `usedAt` _or_ by the guarded UPDATE inside the transaction. Both satisfy the assertion, so when timing sent every loser down the pre-check, `auth.service.ts:212` went uncovered. Added one deterministic test per guard that claims the token between the pre-check and the transaction, so only the in-transaction branch can reject.
Contract: none — tests only, no production code changed.
Files: `apps/api/src/modules/auth/auth.routes.test.ts`.
Validation: full local stack (postgres/redis/s3 + `RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`). `pnpm test:coverage` 606 passed/3 skipped, 6/6 tasks; `pnpm coverage:check` holds at or above baseline, auth branches **81.82 (+1.18)**; typecheck 8/8, lint 9/9, Prettier clean. Both tests mutation-checked: wrapping either guard in `if (false && …)` makes its test fail.
Decisions: fixed the tests, not the baseline — lowering the floor would have hidden an untested race branch in single-use token handling. The old concurrency tests stay: they assert the end-to-end "exactly one winner" invariant the deterministic pair does not.
Follow-up: e2e `login-return.spec.ts:67` («Email подтверждён» heading absent) failed through both CI retries on PR #2; `main`'s run died on the coverage gate before reaching e2e, so it is unknown whether this is a `main` problem — recheck once `main` is green. CR-208 (Dependabot) resumes then; `ip-address@10.7.3`'s quarantine expires 2026-10-05 ~10:35Z.
