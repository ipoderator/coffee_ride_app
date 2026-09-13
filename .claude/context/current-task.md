# Current Task

## Status

done

## Task ID

CR-063 — Design tokens in `packages/ui`

## Goal

Foundation phase (CR-001..CR-010) is done. `docs/design.md` §14 names CR-063/CR-064 as
hard prerequisites for CR-011 (User registration) — the first real screen. CR-063 puts
the light/dark color palette, typography, radius, and focus-ring tokens from
`docs/design.md` §3-§5/§12 into `packages/ui` as CSS custom properties, exposes them
through the Tailwind v4 theme so feature code writes `bg-bg-raised`/`text-text-secondary`
instead of a hex literal, replaces the placeholder shadcn neutral theme currently in
`apps/web/src/app/globals.css`, and adds the lint rule (§14) that rejects raw hex color
literals in `apps/web`.

## Requirements

- Tokens live in `packages/ui` (`docs/design.md` §14), not `apps/web` — `apps/web`
  imports them.
- Full light + dark palette from §3: `bg`, `bg-raised`, `text`, `text-secondary`,
  `text-muted`, `primary`, `on-primary`, `success`, `warning`, `danger`, `on-danger`,
  `info`, `border`, `border-input`, plus the data-viz `chart-secondary` clay tone. Dark
  theme is part of this task, not deferred (§3).
- Typography (§4): Golos Text (Cyrillic-first) over the system stack, IBM Plex Mono for
  tabular/data text. Verify Cyrillic coverage before adopting (§4).
- Font-size scale, weights, line-heights (§4) and spacing (§5): confirm Tailwind v4's
  defaults already match before adding new tokens.
- Radius (§5): 8px default, 12px large surfaces, full for pills.
- Focus ring (§12): visible 2px `primary` ring, 2px offset, on every interactive element.
- Elevation (§5): hairline border for resting cards, one soft low shadow for overlays.
- Lint rule (§14): reject raw hex color literals in `apps/web`.
- No unrelated changes: don't touch `packages/db`/`maps-*`/`types`/`config`, don't start
  CR-064/065/066 content beyond what CR-063 itself requires.

## Acceptance criteria

- `packages/ui` exports a token stylesheet consumed by `apps/web` via its package
  `exports` field — met (`ui/tokens.css`).
- `apps/web/src/app/globals.css` no longer contains the placeholder shadcn palette —
  met.
- Placeholder home page still renders correctly against the new tokens — met, verified
  live (screenshot + computed styles, light and dark).
- A raw hex literal added to `apps/web` is caught by its `eslint` script — met, verified
  live with a real staged violation, then reverted.
- Golos Text + IBM Plex Mono actually render Cyrillic in the browser — met, verified via
  a live `next dev` render (browser-automation skill): correct font family, exact token
  hex values in both themes, no console errors.
- `turbo run lint typecheck build test --force` green — met, 24/24.
- `docs/tasks.md`, `docs/changelog.md`, `project-state.md` updated — met. CR-064 named
  as next.

## Planned files

- `packages/ui/src/tokens.css` (new) — the token source
- `packages/ui/package.json` — `exports` entry for `./tokens.css`
- `apps/web/package.json` — `ui` workspace dependency
- `apps/web/src/app/globals.css` — tokens import, shadcn placeholder removed
- `apps/web/src/app/layout.tsx` — Golos Text / IBM Plex Mono via `next/font/google`
- `apps/web/src/app/page.tsx` — fixed a class referencing a now-removed token name
- `apps/web/eslint.config.mjs` — no-raw-hex-colors rule
- `pnpm-lock.yaml`, `.claude/context/{current-task,project-state,known-issues}.md`,
  `docs/{changelog,tasks}.md`

## Implementation progress

- [x] Read `docs/design.md` in full (§1-§15)
- [x] Inspected current `packages/ui`/`apps/web` state
- [x] Confirmed Golos Text and IBM Plex Mono in `next/font/google`'s bundled metadata
      with `cyrillic`/`cyrillic-ext` subsets
- [x] Wrote `packages/ui/src/tokens.css` (light/dark palette, radius, font/shadow theme
      keys)
- [x] Wired `packages/ui` package exports for the stylesheet
- [x] Updated `apps/web` globals.css/layout.tsx/page.tsx/package.json; `pnpm install`
- [x] Added the hex-color lint rule; verified live with a real violation, reverted
- [x] Visually verified Cyrillic rendering in light + dark via browser-automation
- [x] Validated: `turbo run lint typecheck build test --force` (24/24), Playwright e2e,
      `format:check`/`lint:root`
- [x] Updated project context + docs (this file, project-state.md, known-issues.md
      KI-020, changelog.md, tasks.md)
- [x] Reviewed `git diff`/`git status` — only intended files changed

## Validation

- [x] `next/font/google` metadata check (Node script against installed `next@15.5.25`) —
      both faces list `cyrillic`/`cyrillic-ext`
- [x] Live browser render (browser-automation skill against a temporary `next dev`
      server): title/body text correct, 0 console errors, 0 failed requests,
      `body`/`h1` font-family resolves to `"Golos Text"`, computed `background-color`/
      `color` match the light-theme token hex exactly; toggling `.dark` on
      `documentElement` matched the dark-theme token hex exactly too
- [x] Live ESLint violation test: staged `'#123abc'` in `page.tsx`, confirmed
      `pnpm --filter web exec eslint` reported it, reverted
- [x] `npx turbo run lint typecheck build test --force` — 24/24 green
- [x] `pnpm --filter web exec playwright test` — 1/1 passing
- [x] `pnpm format:check` / `pnpm lint:root` — clean
- [x] `git status`/`git diff` reviewed — only intended files changed

## Discovered issues

- An unrelated, undocumented change to `.vscode/extensions.json` (removed the
  `ms-playwright.playwright` recommendation) was sitting in the working tree from before
  this session, attributed to neither CR-009 nor CR-010 in the changelog. Confirmed with
  the user rather than guessed at; user chose to revert it. Reverted before starting
  CR-063's own work.
- CR-009 and CR-010 had been completed in a prior session but never committed. Committed
  both together as one commit (`0e54dc2`) at the start of this session — splitting them
  would have required fabricating the intermediate "CR-009 done, CR-010 not yet" state of
  `current-task.md`/`project-state.md`, which no longer exists (both files are
  overwritten snapshots, not append-only).
- KI-020 (new, recorded in `known-issues.md`): `apps/web/components.json`'s shadcn CLI
  alias defaults to vendoring components inside `apps/web`, not `packages/ui`, which
  `docs/design.md` §9/§14 requires. Not a CR-063 blocker (no components vendored yet) but
  must be resolved before CR-065/CR-066 vendors the first one.
- An interim `next dev` session (started to verify font rendering live) left
  `apps/web/.next` in a dev-mode state missing files `web:typecheck` expects
  (`.next/types/app/*.ts`, only fully generated by `next build`). Not a bug in this
  task's changes — deleting `.next` before the final validation pass resolved it.
  Worth remembering for future tasks that spin up a dev server mid-session.

## Final result

Done. `packages/ui/src/tokens.css` now holds the full light/dark palette, radius, and
font/shadow theme tokens from `docs/design.md` §3-§5, exposed to `apps/web` via a real
package `exports` entry (`apps/web`'s first-ever workspace dependency on `ui`) rather
than a relative path. The placeholder shadcn neutral theme in `globals.css` is gone.
Golos Text/IBM Plex Mono are wired via `next/font/google` and verified live (not just
via metadata) to actually render Russian text correctly in both themes. Tailwind v4's
default font-size and spacing scales were checked against `docs/design.md` §4/§5 first
and already match exactly, so no redundant parallel tokens were added — real,
design.md-mandated additions were limited to radius, the focus ring, one overlay-shadow
token, and the hex-color lint rule, which was verified live with a real staged
violation. `turbo run lint typecheck build test --force` 24/24 green; Playwright e2e
passing; `format:check`/`lint:root` clean. Also cleaned up two pre-existing loose ends
found at the start of this session (an unrelated uncommitted `.vscode/extensions.json`
edit, reverted after user confirmation; CR-009/CR-010's completed-but-uncommitted work,
committed as `0e54dc2`) before starting CR-063 itself. One new known issue recorded
(KI-020, shadcn CLI's component-vendoring target) for CR-065/CR-066 to resolve. Next
logical task: CR-064 (Russian formatters + UI terminology mapping).
