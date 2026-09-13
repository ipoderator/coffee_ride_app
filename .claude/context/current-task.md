# Current Task

## Status

done

## Task ID

CR-010 — Configure CI + Git hooks

## Goal

Like `docker-compose.yml` (CR-009), `.github/workflows/ci.yml` and the Husky/lint-staged
setup existed since the initial harness scaffold and were hardened once (CR-067: root
lint actually running in CI, restricted token) but never formally closed out as their own
task. One real, already-tracked bug remains open against this exact area — KI-012, whose
own "next action" line names this CR explicitly: lint-staged's pre-commit `eslint --fix`
runs with CWD at the repo root, so it always resolves the root `eslint.config.mjs` (which
deliberately ignores `apps/**`/`packages/**` so `turbo lint` isn't double-covered) —
meaning a staged file inside any of the 8 workspace members is never actually
ESLint-checked at commit time, only Prettier-formatted. CR-010 closes that gap and
reviews the rest of the CI/hooks setup for correctness now that real workspace packages
exist.

## Requirements

- Fix KI-012: make lint-staged workspace-aware. Root cause (confirmed empirically,
  matches KI-012's own diagnosis): ESLint's flat config has no directory cascading —
  the config file used is chosen by the process's CWD, not the linted file's location.
  lint-staged passes **absolute** file paths to its task commands by default (confirmed
  against the installed `lint-staged@15.5.2`'s own docs) — so the fix is to add one
  lint-staged glob entry per workspace member (`apps/web/**/*.{ts,tsx,js,jsx}`, etc.),
  each invoking `pnpm --filter <name> exec eslint --fix --no-warn-ignored` (`pnpm
--filter <name> exec` sets CWD to that package's directory, which is what makes flat
  config resolve correctly — verified live against `apps/web`, exit 0, correct config
  picked up). The generic root-level `*.{ts,tsx,js,jsx}` eslint entry becomes redundant
  once every workspace has its own scoped entry (there are zero non-workspace top-level
  `.ts`/`.js` files in this repo right now — confirmed) and is removed rather than left
  as dead weight; if a genuine root-level script ever appears, CI's `lint:root` step
  still catches it regardless (defense in depth, per KI-012's own framing).
  - Considered the "one `.lintstagedrc` per package, monorepo-native" pattern lint-staged
    itself documents, and rejected it: lint-staged does not merge configs across
    directories, so each of the 8 new per-package config files would need its own copy
    of the Prettier rule too (currently one root rule covers everything) — more files,
    more duplication, no behavioral benefit here since there's nothing package-specific
    beyond directory scoping. A single root config with 8 explicit glob entries stays
    one source of truth and matches this repo's existing preference for explicit static
    config over cleverness.
- Do NOT take on KI-007 (MinIO service / migration step / Playwright job in CI) here —
  that issue's own next action explicitly names CR-080, a separate, larger task. Confirm
  CI's existing shape (checkout → pnpm/node setup → install → format check → lint:root →
  lint → typecheck → test → build, with postgres+redis services) is otherwise sound
  rather than silently expanding scope into CR-080's territory.
- Review Husky itself: confirm `pnpm install`'s `prepare` script actually wires
  `core.hooksPath`/`.husky/pre-commit` in this checkout (it's a fresh clone-like state
  for this task, not assumed from memory), and confirm the pre-commit hook actually
  invokes the corrected lint-staged config end-to-end (not just unit-testing the eslint
  invocation in isolation).
- No unrelated changes: don't touch `docker-compose.yml` (CR-009, done), don't add new
  hook types (commit-msg/commitlint) — `.claude/rules/git.md`'s commit style section says
  "Preferred", not enforced, and adding enforcement tooling is a scope decision this task
  wasn't asked to make.

## Acceptance criteria

- A staged change inside any of the 8 workspace members (`apps/web`, `apps/api`,
  `packages/{config,types,ui,maps-core,maps-2gis,db}`) actually gets ESLint-checked (not
  just Prettier-formatted) by the pre-commit hook, using that package's own
  `eslint.config.mjs`.
- Verified live: stage a real file with an intentional lint violation in at least one
  workspace member, run the pre-commit hook path, confirm it's caught (not silently
  passed) and fixed (auto-fixable) or blocks the commit (not auto-fixable) — not just
  reasoned about.
- `git commit` still works normally for a clean change (hook exits 0, doesn't block
  unrelated files).
- CI (`.github/workflows/ci.yml`) unchanged unless a real gap is found that isn't
  KI-007's territory.
- `turbo run lint typecheck build --force` and `pnpm format:check`/`lint:root` stay green.
- KI-012 marked resolved in `known-issues.md`.
- `docs/tasks.md`, `docs/changelog.md`, `project-state.md` updated.

## Planned files

- `package.json` (root) — `lint-staged` config rewritten to be workspace-aware
- `.claude/context/known-issues.md` — resolve KI-012
- `.claude/context/current-task.md` (this file)
- `.claude/context/project-state.md`
- `docs/changelog.md`
- `docs/tasks.md`

## Implementation progress

- [x] Read `ci.yml`, `.husky/pre-commit`, lint-staged config, KI-007/KI-012
- [x] Confirmed all 8 workspace members have their own `eslint.config.mjs` + local
      `eslint` devDependency + `"lint": "eslint ."` script
- [x] Confirmed lint-staged 15.5.2 passes absolute paths by default (its own README)
- [x] Confirmed `pnpm --filter web exec eslint --fix --no-warn-ignored <abs path>` works
      (exit 0, correct package resolved)
- [x] Rewrite root `package.json`'s `lint-staged` config
- [x] Update the two `eslint.config.mjs` comments (root, `apps/web`) that documented
      the old bypass behavior as current fact
- [x] Live end-to-end test: staged a real unused-variable violation in
      `apps/web/src/app/page.tsx`, ran `pnpm exec lint-staged` (same command
      `.husky/pre-commit` invokes) — confirmed silent skip under the old root-CWD
      behavior and correct detection under the new per-workspace config; test file
      fully reverted afterward, confirmed clean via `git diff`
- [x] Confirmed `core.hooksPath` is wired to `.husky/_` in this checkout
- [x] Reviewed `ci.yml` — sound as-is, KI-007's gaps confirmed out of scope (CR-080)
- [x] Validate (`turbo lint typecheck build --force` 21/21 green, `turbo test --force`
      6/6 passing, `format:check`/`lint:root` clean)
- [x] Update known-issues.md (KI-012 resolved as KI-R09)
- [x] Update project-state.md, docs/tasks.md, docs/changelog.md
- [x] Review git diff

## Validation

- [x] `pnpm --filter web exec eslint --fix --no-warn-ignored <abs path>` — exit 0,
      confirmed correct package config resolved before wiring it into lint-staged
- [x] Live pre-commit simulation: `git add` a file with a real, non-cosmetic
      violation → `pnpm exec lint-staged` → violation reported by the workspace's own
      ruleset; same test against the pre-fix root-only rule produced zero output
      (proves the bug existed and proves the fix closes it, not just plausible)
- [x] `npx turbo run lint typecheck build --force` — 21/21 tasks green
- [x] `npx turbo run test --force` — 6/6 tests passing (5 api + 1 web; unrelated to
      this change, run to confirm nothing broke)
- [x] `pnpm format:check` — clean (one self-inflicted formatting pass needed on this
      file's own markdown, same as every prior task)
- [x] `pnpm lint:root` — clean
- [x] `git status`/`git diff` reviewed — only the intended files changed, test-commit
      artifacts fully reverted

## Discovered issues

- Two `eslint.config.mjs` files (root, `apps/web`) contained comments that explicitly
  asserted lint-staged could not reach workspace files — accurate when written (CR-002),
  now false. Updated both alongside the fix rather than leaving stale documentation next
  to the code it used to describe; not fixing these would have left a misleading trail
  for whoever reads those files next expecting the comment to still be true.
- `packages/config/eslint/node-library.js` also cites KI-012 in a comment, but only as
  a supporting reference for the general "CWD picks the flat config" mechanism (not as
  a claim about current lint-staged behavior) — left unchanged, the citation remains
  accurate as a historical pointer.

## Final result

Done. The one real bug already tracked against this area (KI-012) is fixed and
verified live, not assumed: lint-staged's pre-commit `eslint --fix` now resolves each
workspace member's own `eslint.config.mjs` (via `pnpm --filter <name> exec`, one glob
entry per package) instead of always falling through to the root config, which
deliberately ignores every workspace directory. Proved the before/after difference with
a real staged violation rather than just reasoning about the mechanism. Considered and
rejected lint-staged's own "one config per package" monorepo pattern (would duplicate
the Prettier rule 8 times for no behavioral gain here). `.github/workflows/ci.yml` was
reviewed, found sound, and deliberately left untouched — KI-007's remaining CI gaps
(MinIO, migrations, Playwright) stay CR-080's job, not folded in here. No commit-msg
hook/commitlint was added — `.claude/rules/git.md` only "prefers" a commit style, it
doesn't mandate enforcement, and adding that tooling wasn't asked for.
`turbo run lint typecheck build --force` stayed 21/21 green; `turbo test --force` 6/6
passing; `format:check`/`lint:root` clean. `docs/tasks.md`, `known-issues.md` (KI-012 →
KI-R09), `project-state.md`, `docs/changelog.md` all updated. This closes out the
Foundation phase (CR-001..CR-010, all done). Next logical task: CR-063/CR-064 (Design
foundations), which `docs/design.md` names as a hard prerequisite for CR-011 (User
registration) — not CR-011 directly.
