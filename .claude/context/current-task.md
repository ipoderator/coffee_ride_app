# Current Task

## Status

done

## Task ID

CR-066 — Shared state primitives (`Skeleton`, `EmptyState`, `ErrorState`) + the
degraded-state pattern used by CR-052

## Goal

`docs/design.md` §10 requires every data-bearing screen to ship five states (loading,
empty, error, degraded, success). CR-063/CR-064/CR-065 built the tokens/formatters/
metric components; this is the last Design-foundations task before CR-011 (User
registration) — it builds the three remaining shared primitives so the first real
screen doesn't have to invent loading/empty/error/degraded UI ad hoc.

## Requirements (`docs/design.md` §9/§10/§12, `.claude/rules/frontend.md`)

- **Skeleton**: shimmer block matching final layout shape (no centered spinner), purely
  decorative (`aria-hidden`), animation gated behind `motion-safe:` so
  `prefers-reduced-motion` users get a static placeholder instead (§12).
- **EmptyState**: explains _why_ it's empty and offers a next action — never a bare
  "Нет данных". `title`/`description` are screen-specific copy supplied by the caller
  (this module can't know why a given screen is empty), `action` is an optional slot
  (e.g. a "Сбросить фильтры" button). Announced via `role="status"` so a screen reader
  user filtering a list hears the result.
- **ErrorState**: plain-language message + retry affordance, never a stack
  trace/HTTP status/raw server string (`.claude/rules/backend.md`). Also doubles as the
  **degraded-state** primitive (§10 point 4: a failing dependency degrades locally,
  never blanks the page) via `tone`/`variant` props instead of a second component:
  `tone="danger"` + `variant="block"` (default) for a full failure with `role="alert"`;
  `tone="warning"` + `variant="inline"` for an inline degraded notice (e.g. "2GIS
  unavailable" next to a still-usable list) with `role="status"` (non-interrupting).
- No hardcoded Russian UI strings inside components (`.claude/rules/frontend.md`) — the
  retry button's default label goes through `terminology.ts` (new `UI_TERMS.retry`),
  not an inline literal. Screen-specific copy (EmptyState's explanation, an error
  message) is inherently per-screen and always caller-supplied, never defaulted here.
- KI-020 (shadcn CLI's vendoring target) becomes directly relevant: `Skeleton` **is** a
  real shadcn-registry primitive (unlike CR-065's four components). Resolved by
  hand-vendoring it directly against our own tokens/`cn`, rather than resolving the
  CLI-targeting question — scoped to this trivial component, not a general answer.
- Live visual check required (same discipline as CR-063/065).

## Acceptance criteria — all met

- `Skeleton`, `EmptyState`, `ErrorState` exported from `packages/ui`'s entry point.
- `UI_TERMS.retry` added to `terminology.ts`, used as `ErrorState`'s default
  `retryLabel`.
- Real component tests (jsdom + Testing Library): 71/71 passing across 9 files (up
  from CR-065's 54).
- Live visual check (temporary render in `apps/web`, light + dark, browser-automation
  skill) — done, reverted afterward, and it caught a real bug (see below).
- `turbo run lint typecheck build test --force` — 25/25 green.
- `pnpm format:check` / `pnpm lint:root` — clean.
- `docs/tasks.md`, `docs/changelog.md`, `project-state.md`, `architecture-map.md`,
  `known-issues.md` updated.

## Planned files — all delivered as planned

- `packages/ui/src/components/{Skeleton,EmptyState,ErrorState}.tsx` + colocated
  `.test.tsx` each
- `packages/ui/src/terminology.ts` — `UI_TERMS` added (additive) + test
- `packages/ui/src/index.ts` — re-exports
- `.claude/context/known-issues.md` — KI-020 updated (scoped resolution for Skeleton,
  general question stays open)
- `.claude/context/{project-state,architecture-map,current-task}.md`,
  `docs/{changelog,tasks}.md`
- (temporary, reverted) `apps/web/src/app/page.tsx`, `apps/web/next.config.ts` — live
  visual check only

## Implementation progress

- [x] `UI_TERMS.retry` in terminology.ts + test
- [x] `Skeleton` + test
- [x] `EmptyState` + test
- [x] `ErrorState` (block/inline, danger/warning) + test
- [x] Wired into `index.ts`
- [x] Live visual check (light + dark via browser-automation skill), fixed the bug it
      found, reverted temporary files (`git status`/diff confirmed byte-identical to
      committed state)
- [x] Full validation, fixed every finding
- [x] Updated project context + docs
- [x] Reviewed `git diff`/`git status` — only intended files changed (plus the
      pre-existing untracked `skills-lock.json`, unrelated, left alone)

## Validation

- [x] `pnpm --filter ui test` — 71/71 passing (9 test files)
- [x] `npx turbo run lint typecheck build test --force` — 25/25 green
- [x] `pnpm format:check` / `pnpm lint:root` — clean
- [x] Live browser check (browser-automation skill against a temporary `next dev`
      server): light + dark screenshots verified visually; pulse animation confirmed
      present (`animation-name: pulse`) without reduced motion and absent
      (`animation-name: none`) under emulated `prefers-reduced-motion: reduce`; 0
      console errors, 0 failed requests on the real page loads
- [x] `git status`/`git diff` reviewed — only intended files changed

## Discovered issues

- **Real bug, found live and fixed in this session**: `ErrorState` defines its own
  `onClick` (the retry button). Rendered from a Next.js App Router Server Component
  (the temporary showcase `page.tsx`) without `'use client'` on `ErrorState` itself,
  the build failed outright: "Event handlers cannot be passed to Client Component
  props." Fixed by adding `'use client'` to `ErrorState.tsx` (a real, permanent fix —
  the component genuinely needs it, not a showcase-only workaround). Separately, the
  temporary showcase page itself also needed `'use client'` (a Server Component cannot
  pass an inline closure across the RSC boundary at all, even into a properly-marked
  Client Component child) — that directive was showcase-only scaffolding and was
  reverted with the rest of the temporary page. `Skeleton`/`EmptyState` wire no
  handlers of their own and needed no directive. This is exactly the class of bug the
  live-check discipline exists for — no jsdom test has an RSC serialization step to
  catch it.
- KI-020 (shadcn CLI's vendoring target): updated, not resolved in general.
  `Skeleton`'s hand-vendor is a reasonable per-component escape hatch (trivial upstream
  component) but doesn't answer the question for a structurally complex future
  primitive (`Dialog`/`Select`/`DatePicker`/...).

## Final result

Done. `packages/ui` now has all three remaining `docs/design.md` §10 state
primitives — `Skeleton`, `EmptyState`, `ErrorState` — completing the Design-foundations
phase (CR-063..CR-066) started with tokens/formatters/metric components. `ErrorState`
deliberately covers both the Error and Degraded states from §10 via `tone`/`variant`
rather than a second component, directly implementing CR-052/
`.claude/rules/resilience.md`'s "a failing dependency degrades locally, never blanks
the page" pattern. `terminology.ts` gained `UI_TERMS.retry` for the retry button's
default label. A live visual check found and fixed a real, permanent bug: `ErrorState`
needed `'use client'` for its own event handler to cross the Next.js App Router's
Server/Client boundary. `turbo run lint typecheck build test --force` 25/25 green;
`format:check`/`lint:root` clean; 71/71 `packages/ui` tests passing. KI-020 (shadcn
vendoring target) updated with a scoped resolution for `Skeleton`, stays open for a
future structurally complex primitive. Next logical task: CR-011 (User registration) —
the first real screen, first consumer of the entire Design-foundations phase, and the
first task to add a real domain table to `packages/db`.
