# Current Task

## Status

done

## Task ID

CR-065 — Metric presentation components (`MetricTile`, `MetricRow`, `StatusBadge`,
`DifficultyScale`)

## Goal

`docs/design.md` §6 defines the metric presentation system — the most reused visual
pattern in the product, borrowed from Strava/TrainingPeaks/Rouvy. CR-065 builds its four
named components in `packages/ui` (`docs/design.md` §9's shared-component inventory),
on top of CR-063's tokens and CR-064's formatters/terminology, so every future screen
(starting CR-011) renders metrics/status/difficulty identically instead of
re-implementing the pattern per feature.

## Requirements (`docs/design.md` §6, cross-checked against §1/§5/§9/§12/§13)

- **MetricTile**: label (12px/500/uppercase/0.04em/`text-secondary`) + value
  (24–30px/600/tabular-nums/`text`) + unit (inline, 0.6em of value size, 400,
  `text-secondary`). Unit is never bold/same size as the value. A missing value
  renders as `—`, never `0`, never an empty box. Tiles carry no background of their
  own — separation comes from spacing only.
- **MetricRow**: desktop 3–5 tiles in a single row; mobile 2 columns, wrapping, never a
  horizontal scroller. Canonical order (not structurally enforced — a consumer
  concern, documented): дистанция → набор высоты → средний темп → длительность.
- **StatusBadge**: renders a `{label, tone}` pair (`terminology.ts`'s
  `RideStatusTerm`/`StatusTone` shape from CR-064). Per §1's "one exception": `danger`
  is the only tone allowed as a _filled_ (solid-background) badge; every other tone
  stays a low-weight tinted chip — matching the calm/low-saturation direction, and
  consistent with `tokens.css` only defining a contrasting foreground (`--on-danger`,
  `--on-primary`) for the two tones actually meant to carry a solid fill. Never color
  alone — the label text is always rendered.
- **DifficultyScale**: discrete 1–5 scale as filled/empty segments **plus** a word
  (`Лёгкий`/`Ниже среднего`/`Средний`/`Сложный`/`Очень сложный`) — not a color
  gradient, not color-only. The five words weren't in `terminology.ts` yet (CR-064
  scoped exactly to §7/§13; difficulty is §6) — added here, additively.
- Accessibility (§12): decorative segments are `aria-hidden`; the meaningful state is
  always in visible text (`StatusBadge`'s label, `DifficultyScale`'s word) plus one
  `sr-only` numeric qualifier for the scale (`уровень 3 из 5`) so a screen reader
  hears the position, not just the word.
- `packages/ui` needed its first React-rendering test setup (jsdom + Testing Library) —
  `format.test.ts`/`terminology.test.ts` (CR-064) only needed plain `node`; component
  tests need a real DOM. Mirrors `apps/web`'s existing jsdom+RTL Vitest config.
- New shared `cn` helper (`clsx` + `tailwind-merge`) inside `packages/ui` — components
  need it and `packages/ui` cannot depend on `apps/web` (wrong dependency direction,
  `.claude/rules/architecture.md`); `apps/web`'s own `cn` stays as-is (each package
  owns the copy it consumes, same pattern already used for per-package ESLint config,
  KI-R09).
- KI-020 (shadcn CLI's vendoring target) is explicitly **not** triggered by this task:
  none of these four components are shadcn-registry primitives (shadcn has no
  "MetricTile"/"DifficultyScale"), and `StatusBadge` is implemented self-contained
  rather than composed from a separate generic `Badge` primitive specifically to avoid
  pulling that still-open question into this task's scope. `Badge` itself stays
  unscheduled; KI-020 stays open for whichever CR vendors it.
- No unrelated changes: don't touch `packages/db`/`maps-*`/`types`/`config`, don't
  start CR-066 (`Skeleton`/`EmptyState`/`ErrorState`) content.

## Acceptance criteria

- All four components exported from `packages/ui`'s entry point — met.
- Real component tests (jsdom + Testing Library) — met, 54/54: normal + missing-value
  rendering (`MetricTile`), layout children pass-through (`MetricRow`), every tone
  including the danger-is-filled/others-are-tinted distinction (`StatusBadge`), and
  correct segment count + word + `sr-only` qualifier per level (`DifficultyScale`).
- `format.ts`'s existing tested contract unchanged; new `*Parts` helpers additive only
  — met, existing 31 tests still pass byte-for-byte plus new `*Parts`/equivalence
  tests.
- Difficulty words added to `terminology.ts`, matching §6 exactly — met.
- One live visual check (temporary render in `apps/web`, screenshot light + dark,
  reverted afterward) — met, and it caught a real bug (see Discovered issues).
- `turbo run lint typecheck build test --force` green — met, 25/25.
- `docs/tasks.md`, `docs/changelog.md`, `project-state.md` updated — met. CR-066 named
  next.

## Planned files

- `packages/ui/src/lib/cn.ts` (new)
- `packages/ui/src/components/{MetricTile,MetricRow,StatusBadge,DifficultyScale}.tsx`
  (new) + colocated `.test.tsx` each
- `packages/ui/src/format.ts` — additive `*Parts` helpers (`formatDistanceParts`, etc.),
  existing joined formatters refactored to compose them (behavior-preserving)
- `packages/ui/src/terminology.ts` — `DifficultyLevel`/`DIFFICULTY_LEVEL_TERMS` added
- `packages/ui/src/index.ts` — re-export components + `cn`
- `packages/ui/vitest.config.ts`/`vitest.setup.ts` — switched from the
  `node`-environment `config/vitest/node-library` fragment to a package-local jsdom +
  React config with explicit RTL `afterEach(cleanup)`
- `packages/ui/tsconfig.json` — includes `vitest.setup.ts` (needed for jest-dom's
  ambient type augmentation to reach the component tests under `tsc --noEmit`)
- `packages/ui/eslint.config.mjs` — hex-literal restriction (mirrors `apps/web`'s)
- `packages/ui/package.json` — `clsx`/`tailwind-merge` deps, RTL/jsdom/react-dom/
  `@vitejs/plugin-react` devDeps, `react-dom` peer dep, `config` workspace devDep
  dropped (only existed for the now-removed node-library vitest fragment)
- **`apps/web/src/app/globals.css`** — real fix, not temporary: `@source` directive so
  Tailwind actually scans `packages/ui/src` (see Discovered issues)
- `pnpm-lock.yaml`
- (temporary, reverted before completion) `apps/web/src/app/page.tsx`,
  `apps/web/next.config.ts` — live visual check only
- `.claude/context/{current-task,project-state,architecture-map,known-issues}.md`,
  `docs/{changelog,tasks}.md`

## Implementation progress

- [x] Read `docs/design.md` §1/§2/§5/§6/§9/§11/§12/§13, `docs/tasks.md` CR-065/066
      scoping, KI-020, current `packages/ui`/`apps/web` state
- [x] Added `*Parts` formatters to `format.ts` (additive, joined formatters refactored
      to compose them) + tests; verified old 31 tests still pass unchanged first
- [x] Added difficulty terminology to `terminology.ts` + tests
- [x] `cn` helper
- [x] Four components + tests
- [x] Wired jsdom Vitest config + new devDependencies, `pnpm install`
- [x] Live visual check (temporary showcase + `transpilePackages`), screenshot light +
      dark, reverted both temporary files afterward
- [x] Found and fixed a real bug during the live check (see Discovered issues), then
      re-verified visually before reverting
- [x] Ran full validation, fixed every finding
- [x] Updated project context + docs (this file, project-state.md,
      architecture-map.md, known-issues.md, changelog.md, tasks.md)
- [x] Reviewed `git diff`/`git status` — only intended files changed (plus the
      pre-existing untracked `skills-lock.json`, unrelated, left alone); confirmed
      `page.tsx`/`next.config.ts` reverted byte-identical to their committed state

## Validation

- [x] `pnpm --filter ui test` — 54/54 passing (6 test files)
- [x] `npx turbo run lint typecheck build test --force` — 25/25 green
- [x] `pnpm format:check` / `pnpm lint:root` — clean
- [x] `pnpm --filter web exec playwright test` — 1/1 passing
- [x] Live browser check (browser-automation skill against a temporary `next dev`
      server): light + dark screenshots, 0 console errors, 0 failed requests on the
      real page loads; all 7 status tones, both difficulty levels tested, and all 6
      metric tiles (including one deliberately-missing value) render exactly as
      `docs/design.md` §1/§6/§13 specify
- [x] `git status`/`git diff` reviewed — only intended files changed

## Discovered issues

- **Real bug, found live and fixed in this session**: Tailwind v4's automatic content
  detection only scans `apps/web`'s own directory tree — it never crosses into a
  sibling monorepo package (`packages/ui`), symlinked into `node_modules` or not.
  Without an explicit `@source` directive, every Tailwind utility class used
  exclusively inside `packages/ui`'s components (`rounded-full`, `bg-bg-raised`, the
  `gap-1` between a metric's value and unit, the tint/opacity classes on
  `StatusBadge`, ...) was silently never generated — present correctly in the DOM's
  `class` attribute, computed style showing browser defaults (`border-radius: 0`,
  `display: block` instead of `inline-flex`, etc.). This is exactly why the live
  visual check exists: `pnpm --filter ui test` (jsdom, no real layout/paint) could
  never have caught it — the first screenshot showed every component completely
  unstyled. Root-caused by inspecting `getComputedStyle` against the actual served
  CSS bundle (24KB, missing `rounded-full`/`bg-bg-raised` entirely) rather than
  guessing from the screenshot. Fixed with `@source
'../../../../packages/ui/src';` in `apps/web/src/app/globals.css` (a real,
  permanent fix, not part of the reverted temporary showcase) — re-verified live
  after the fix, screenshot now matches the design spec exactly in both themes.
- KI-020 (shadcn CLI's vendoring target) confirmed still open, not touched by this
  task (see Requirements above) — `StatusBadge` was deliberately built self-contained
  to avoid needing to resolve it here.

## Final result

Done. `packages/ui` now has four real, tested, visually-verified components
(`MetricTile`, `MetricRow`, `StatusBadge`, `DifficultyScale`) implementing
`docs/design.md` §6 on top of CR-063's tokens and CR-064's formatters/terminology.
`format.ts` gained additive `*Parts` helpers (value/unit split for `MetricTile`'s
styling needs) without changing its existing joined-string contract — verified by
re-running the original 31 tests unchanged before adding anything new.
`terminology.ts` gained the five difficulty-scale words from §6. `packages/ui` has its
first jsdom+Testing Library Vitest setup (54 tests across 6 files) and a new shared
`cn` helper. A real, previously-invisible bug was found via the mandated live visual
check and fixed permanently: `apps/web/src/app/globals.css` needed an explicit
`@source` directive for Tailwind v4 to scan `packages/ui/src` at all — without it,
every one of packages/ui's own Tailwind classes silently generated no CSS. `turbo run
lint typecheck build test --force` 25/25 green; Playwright e2e passing;
`format:check`/`lint:root` clean. KI-020 (shadcn vendoring target for a future generic
`Badge`) stays open, deliberately untouched. Next logical task: CR-066 (Shared state
primitives — `Skeleton`, `EmptyState`, `ErrorState` + the degraded-state pattern used
by CR-052, `docs/design.md` §10) — the last Design-foundations prerequisite before
CR-011.
