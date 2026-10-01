# Current task

## CR-161…CR-163 — CI unblock, KI-078/079/066/065, nightly load test

Status: **done, committed** (2026-10-01). Details: `docs/changelog.md`.

- [x] CR-161: coverage gate green with real tests (ui 202, web +5); KI-078
      toggle hidden while the map is degraded + `home.spec.ts` regression.
- [x] KI-079: CI run `36856168437` — only `ride-detail` chromium differed
      (CR-155 layout); its actual committed as baseline.
- [x] Fixed my own slip: moving KI-079 truncated the KI archive in `047e8fa`
      (opened for write before read); restored verbatim in `855fd7e`.
- [x] CR-162: KI-066 aggregate endpoint + widget; KI-065 visibility endpoint +
      form (owner: hide anytime, re-show only with no registrations).
- [x] CR-163: `api-latency.js` think time (nightly load test red since CR-139).
- Owner-side, not code: `EMAIL_FROM_ADDRESS` + Unisender DNS (KI-026/042/055);
  commercial 2GIS key (KI-075).

## CR-160 — Fix 2GIS multi-stop routing bug (found finishing CR-148)

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-160.

- [x] Found: 2GIS became reachable from this machine; ran `pnpm seed:demo`
      without `--no-routes` for the first time — first ride (a closed loop)
      failed `422 route_not_buildable`.
- [x] Root cause confirmed live against the real Routing API: every point was
      sent as `type: 'stop'`; 2GIS only honors `stop` at the first/last
      position, silently drops one in the middle.
- [x] Fix: `packages/maps-2gis/src/route.ts` sends `type: 'pref'` for
      intermediate points, `type: 'stop'` for first/last only.
- [x] Regression test added (`provider.test.ts`).
- [x] Live-verified: 7-point loop 51 m → 22 417 m (all waypoints honored).
- [x] `pnpm seed:demo` (no `--no-routes`) now green end to end — completes
      **CR-148**.
- [x] `packages/maps-2gis` typecheck/lint/test 48/48; live contract suite
      5/5; `apps/api` typecheck/lint/test 495/495.
- [x] `docs/tasks.md` (CR-148 checked off, CR-160 added), `docs/changelog.md`,
      `.claude/context/known-issues.md` (KI-056 updated), `project-state.md`
      updated.
- [x] Committed/pushed.

## CR-159 — Fix KI-080: light-theme `--danger` contrast

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-159.

- [x] Light `--danger` `#D42B20` → `#B92A1E` (`packages/ui/src/tokens.css`),
      AA against `--bg` and `ErrorState`'s tint, not just white.
- [x] `docs/design.md` §3 swatch table/prose updated.
- [x] Storybook's `KI_080_DANGER_CONTRAST` axe exception removed (file
      deleted, 4 story files no longer import it).
- [x] ui/web typecheck+lint+test green; `test:storybook` 59/59, zero axe
      rules disabled; visually checked via `storybook-mcp`.
- [x] KI-080 archived as resolved.

## CR-158 — Storybook for UI primitives and ride components

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-158.

Request (owner): Storybook via `create storybook --features docs test a11y` +
`@storybook/addon-mcp`, `componentsManifest` on; stories for Button, Input, Badge,
RideCard, RideStatus, RideFilters with light/dark themes and loading/error/empty/
disabled; a11y + interaction tests; no product UI change; run it and connect it to
Claude Code (`storybook-mcp`, project scope).

- [x] Storybook in `apps/web` (nextjs-vite); addons vitest/a11y/docs/mcp.
- [x] Six story files, every state + dark + both-themes; `play` tests.
- [x] `test:storybook` 59/59 (axe WCAG 2.1 AA as errors); unit 490/490.
- [x] Dev server on :6006, `/mcp` answers; `.mcp.json` has `storybook-mcp`.
- Found: KI-080 (light `--danger` contrast) — scoped exception in 7 stories.

## CR-157 — Larger, easier date picker on the create-ride page

Status: **done, not committed** (2026-09-29). Validation: see `docs/changelog.md`
CR-157. Previous task CR-156 (wizard) is done and committed (`765771f`).

Request (owner, screenshot of Safari's native date popup): «сделай календарь
удобнее и больше на странице создания заезда».

### Acceptance

- [x] Larger day targets (48px), readable numbers, Russian month/weekday names.
- [x] Faster picking: «Сегодня / Завтра / Сб / Вс» quick picks; past days disabled.
- [x] Phone: bottom sheet, no horizontal scroll; keyboard + screen-reader support.
- [x] Value contract unchanged (`YYYY-MM-DD`), create flow + e2e green.
