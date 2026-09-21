# Current task

Task ID: none active — this file records a paused-and-awaiting-decision state
from an `/impeccable critique apps/web` design review, so a fresh session can
resume without re-deriving it.

Status: **CR-103/CR-104/CR-105/CR-106 done and live-verified. Only the
visual-direction phases (item 6) remain, not yet authorized.**

## What happened this session (chronological, for a fresh session to skim)

1. Prior session: full `/impeccable critique apps/web` (original run +
   independent re-run), CR-102 (dead-space layout bug) fixed and
   re-verified. That session ended with the backlog below identified but
   NOT authorized — user explicitly withheld «внедряй» and asked only to
   persist state.
2. This session, first item: user said «внедряй» for **P0**
   (`Dialog`/`ConfirmDialog`/`Toast` + `RegistrationButton` wiring). Built
   as **CR-103** — full detail: `docs/changelog.md`'s CR-103 entry.
   Live-verified end to end (register → toast; cancel → confirm dialog →
   dismiss with no API call, or confirm → cancel + toast).
3. This session, second item: user reconfirmed the plan is the critique's
   recommended order, then said «внедряй» again for **P1 item 3**
   (`RideSummaryWidget` for the organizer dashboard). Built as **CR-104**:
   new `GET /v1/rides/mine/summary` (`apps/api`'s `rides` module — ride
   counts by status + active-registration/waitlist counts across every
   ride the caller organizes, 3 parallel indexed queries, not a multi-join
   fan-out), new `RideSummaryWidget` (`apps/web/src/features/organizer/
rides/components/`), registered into `ORGANIZER_WIDGETS` (ADR-009) at
   order 20. Full detail: `docs/changelog.md`'s CR-104 entry.
   Live-verified against the real running stack (`/organizer` showed the
   correct real counts for the CR-103 QA organizer's one ride).
4. Both items validated (typecheck/lint/tests/build all clean — see the
   changelog entries for exact numbers) and live-verified in a real
   browser against the real running dev stack, no mocks. Hit the same
   environment issue twice: running a production `next build` against a
   live `next dev` server's `.next` directory corrupts it — restarted the
   dev server with a fresh `.next` both times. Worth avoiding next time
   (stop the dev server before a production build, or build from a
   separate checkout) rather than re-discovering it per session.
5. `docs/tasks.md`/`docs/changelog.md`/`docs/api.md`/`project-state.md` all
   updated for CR-103 and CR-104. This file rewritten to reflect both done
   and the remaining backlog, at the user's standing preference from the
   prior session (keep this file intact rather than clearing it, so a
   fresh session/window can resume).
6. This session, third item: user said «внедряй» again for **P1 item 4**
   (sticky mobile registration CTA). Built as **CR-105**: below `md`, the
   same `RegistrationButton` instance repositions into a fixed bottom bar
   instead of a second mounted copy (`CabinetShell.tsx`'s mobile-nav
   pattern), gated behind `FEATURE_STICKY_REGISTRATION_CTA` per CR-055's
   mechanism (`isFeatureEnabled`, read server-side in `app/rides/[id]/
page.tsx`, threaded down as a prop — `RideDetailView` is a Client
   Component and can't read the env var itself). Full detail:
   `docs/changelog.md`'s CR-105 entry. Live-verified against the real dev
   stack at 375×812 (fixed, pinned to bottom) and 1280×900 (static, normal
   flow) with the flag on; dev server restarted a second time without it
   afterward to leave the environment exactly as found.
7. This session, fourth item: user said «внедряй» again for **P2**
   (icons). Built as **CR-106**: `CabinetNavItem` gained an optional
   `icon` field (a name, resolved against a small `CABINET_ICONS` map in
   `CabinetShell.tsx`); every current organizer/participant nav descriptor
   sets one, `SiteHeader.tsx` got icons directly. Hit and fixed a real bug
   mid-session: the first attempt put the actual `lucide-react` component
   on the descriptor, which is built server-side and handed to the Client
   Component `CabinetShell` as a prop — React Server Components can't
   serialize a function/component value across that boundary, and
   `/organizer`/`/me` both 500'd until fixed (name + lookup-map
   indirection instead). Full detail: `docs/changelog.md`'s CR-106 entry.
   Live-verified end to end: register → verify-email (dev-only link) →
   login → `/me` at 375×812 and 1280×900 showing all 3 participant-nav
   icons as real SVGs, zero console errors; `SiteHeader` verified on
   `/register` (4 icons); `/organizer` confirmed via its own 200 status
   post-fix (same code path, not separately walked with a real organizer
   profile this session).

## Open backlog

Unchanged in substance from the critique — P0, P1-item-3, P1-item-4, and P2
are now done (CR-103/CR-104/CR-105/CR-106, above). The user has NOT said
«внедряй» for anything past those four; only the "New visual direction"
phases below remain.

Full reports: `apps/web/.impeccable/critique/2026-09-21T15-54-48Z__apps-web.md`
(first run) and `apps/web/.impeccable/critique/2026-09-21T16-23-05Z__apps-web.md`
(re-run).

**[P0] DONE (CR-103).** Confirm-before-cancel + success toasts on
`RegistrationButton.tsx`, `Dialog`/`ConfirmDialog`/`Toast` built in
`packages/ui`.

**[P1] DONE (CR-104).** `RideSummaryWidget` on the organizer dashboard —
ride/registration/waitlist counts, via new `GET /v1/rides/mine/summary`.

**[P1] DONE (CR-105).** Registration CTA is the hardest element to reach
on `/rides/[id]` — renders after 7 other content blocks, no sticky/mobile
placement. Now a fixed bottom bar below `md`, behind
`FEATURE_STICKY_REGISTRATION_CTA`.

**[P2] DONE (CR-106).** Zero icon usage anywhere in the app —
`lucide-react` is installed, unused. Cabinet nav / site header / mobile
bottom tab bar are plain text. Now: `CabinetNavItem.icon` (name-based,
resolved client-side) + `SiteHeader`'s own icons, outline, always labeled.

**[P3]** `docs/design.md` §9's component inventory doesn't fully match
`packages/ui`'s actual contents — `Dialog`/`Toast` now real (CR-103);
`Tabs`, `Sheet`, `Select`, `Checkbox`, `RadioGroup`, `DatePicker`,
`Pagination` are still listed but don't exist (`RideFilters.tsx` documents
working around the missing `Select`, citing `KI-020`, which now also notes
three consecutive non-trivial primitives choosing the hand-vendor escape
hatch — worth resolving the shadcn CLI-targeting question directly next
time one is needed).

## New visual direction ("Quiet Instrument") — synthesized, not yet built

Full detail in the two critique snapshot files above. Summary: keep
`docs/design.md`'s calm/warm/low-saturation baseline and single-accent
principle unchanged; add two new tokens (`--scrim`, `--glass-bg`/
`--glass-border`) used only on two surfaces (a cover-photo title panel, a
sticky mobile registration bar); keep Golos Text (no new UI typeface);
adopt `lucide-react` icons (outline, always labeled); extend
`MapPolylineInput` additively for route-line weight (no new ADR, same
precedent as ADR-020); wordmark direction: Golos Text at two weights
("coffee" 500 + ".ride" 400 in `--primary`) as the MVP default.

`Dialog`'s backdrop (CR-103) deliberately did NOT introduce `--scrim` —
reused the existing `--color-text` token at reduced opacity instead, since
`--scrim` is scoped to this visual-direction phase, not yet authorized.

## Recommended order (offered to the user; items 1-3 done)

1. ~~`packages/ui`: build `Dialog`/`ConfirmDialog` + `Toast`~~ — done, CR-103.
2. ~~Wire into `RegistrationButton.tsx`~~ — done, CR-103.
3. ~~`RideSummaryWidget` for the organizer dashboard~~ — done, CR-104.
4. ~~Sticky mobile registration CTA (P1, behind a feature flag per
   `.claude/rules/extensibility.md`)~~ — done, CR-105.
5. ~~Icons in `CabinetShell`/`SiteHeader` (P2)~~ — done, CR-106.
6. Visual direction phases (tokens → cards → map polyline weight →
   wordmark) — see the critique snapshot's "Implementation Plan" section.

## Next logical task

**Awaiting user decision + the literal word «внедряй»** before the visual-
direction phases (item 6 — tokens → cards → map polyline weight →
wordmark) are implemented. Everything else in the recommended order is now
done. A fresh session should re-read this file, `.claude/context/
project-state.md`, and the two critique snapshots, then confirm with the
user before starting the visual-direction work rather than assuming.
