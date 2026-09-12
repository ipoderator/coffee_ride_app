# Current Task

## Status

done

## Task ID

CR-002 — Configure Next.js web

## Goal

Scaffold `apps/web` as the first real workspace member: Next.js 15 (App Router) +
React + TypeScript, Tailwind CSS, and the shadcn/ui foundation (CLI config + `cn`
helper + baseline CSS variables) — the framework/tooling layer only. Real design
tokens (`docs/design.md` palette/typography/spacing) are CR-063, not this task; the
shadcn default neutral theme is an accepted placeholder until then. Feature-module
structure (`.claude/rules/extensibility.md`) starts with CR-011+, not here — this task
ships a minimal placeholder home page only, enough to prove the app builds/runs.

## Requirements

1. `apps/web` matches `pnpm-workspace.yaml` (`apps/*`) and turbo.json's task
   expectations (`dev`, `build`, `lint`, `typecheck`; no `test` yet — that's CR-008).
2. Exact, ecosystem-compatible pinned versions (project convention: pin exactly,
   see `pnpm@10.34.5`) — verified via npm registry before writing:
   - `next@15.5.25` (latest stable Next **15**, not 16 — fixed stack pins major 15)
   - `react@19.3.0` / `react-dom@19.3.0` (Next 15's required major)
   - `typescript@6.0.3` — **not** latest (`7.0.2`): `typescript-eslint@8.70.0`
     (already installed at root) requires `typescript >=4.8.4 <6.1.0`; 6.0.3 is the
     newest release inside that range. Also add explicitly to root
     `devDependencies` (previously only present as pnpm's implicit peer
     resolution — pin it explicitly so it can't silently drift).
   - `tailwindcss@4.3.3` + `@tailwindcss/postcss@4.3.3` (CSS-first v4 config, no
     `tailwind.config.js`)
   - `eslint-config-next@15.5.25` (matches next's version)
   - shadcn/ui foundation deps: `class-variance-authority@0.7.1`, `clsx@2.1.1`,
     `tailwind-merge@3.6.0`, `lucide-react@1.45.0`, `tw-animate-css@1.4.0`
   - `@eslint/eslintrc@3.3.7` (needed for `FlatCompat` — `eslint-config-next` still
     ships legacy-style configs, not a prebuilt flat export)
   - `@types/node@24.13.4` (matches pinned Node 24), `@types/react@19.3.0`,
     `@types/react-dom@19.3.0`
3. `apps/web/tsconfig.json` extends root `tsconfig.base.json`, adds Next-required
   options (bundler resolution, JSX preserve, `@/*` → `./src/*`).
4. ESLint: `apps/web/eslint.config.mjs` via `FlatCompat` composing
   `next/core-web-vitals` + `next/typescript`, resolved correctly when `turbo lint`
   runs with CWD = `apps/web` (verified empirically — flat config resolves from
   CWD, not per-file directory, so this only works through `turbo lint`/CI, not
   through the repo-root `eslint .`).
5. **Root `eslint.config.mjs` must now ignore `apps/**`/`packages/**`** — its own
   comment already says workspace members "extend individually via `turbo lint`";
   without this, `pnpm lint:root` (`eslint .` from repo root) would try to lint
   Next/JSX files with the bare root config and likely error. Verified empirically
   that ESLint flat config has no automatic directory cascading — one config wins
   per invocation, chosen by CWD.
6. Known, accepted gap from (5): lint-staged's pre-commit `eslint --fix` also runs
   with CWD = repo root, so it will use the (now apps/**-ignoring) root config too
   — apps/web staged files get silently skipped by ESLint at pre-commit time
   (Prettier still runs on them). Add `--no-warn-ignored` to keep that quiet.
   Record as a known issue; real fix (workspace-aware pre-commit lint) belongs to
   CR-010 ("Configure CI + Git hooks"), not this task.
7. `components.json` (shadcn/ui config) + `src/lib/utils.ts` (`cn` helper) +
   Tailwind v4 CSS variables baseline in `globals.css` — hand-written to match
   what `shadcn init` would generate (no interactive CLI run), since this
   environment has no way to answer its prompts non-interactively for Tailwind v4.
8. Minimal placeholder home page: no hard-coded brand colors
   (`.claude/rules/frontend.md`) — only Tailwind's neutral defaults / shadcn CSS
   variables, since real tokens don't exist until CR-063.
9. `pnpm format:check`, `pnpm lint:root`, `turbo run lint|typecheck|build` (not
   `test` — no test runner yet) must all pass with `apps/web` now in scope.

## Acceptance criteria

- `apps/web` builds (`turbo build`) and typechecks (`turbo typecheck`) cleanly;
- `turbo lint` passes for `apps/web` using its own Next-aware config;
- `pnpm lint:root` / `format:check` still pass at the repo root (now excluding
  `apps/web`);
- no hard-coded colors/strings outside Tailwind defaults/shadcn CSS variables;
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `architecture-map.md`,
  `docs/changelog.md` updated;
- `git diff` reviewed, no `node_modules`/build output committed.

## Planned files

`apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`,
`postcss.config.mjs`, `eslint.config.mjs`, `components.json`, `.gitignore`,
`src/app/{layout,page}.tsx`, `src/app/globals.css`, `src/lib/utils.ts`;
root `package.json` (add pinned `typescript`, `--no-warn-ignored` in lint-staged),
`eslint.config.mjs` (ignore `apps/**`/`packages/**`); `.claude/context/{project-state,
architecture-map,known-issues,current-task}.md`, `docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] researched + pinned compatible versions (see Requirements §2; switched from an
      initial exact-pin plan to caret ranges for everything except `typescript`, to
      match root's own established convention — see Discovered issues)
- [x] scaffold `apps/web` files
- [x] update root `package.json` / `eslint.config.mjs` (ignore `apps/**`/`packages/**`,
      pin `typescript`, `--no-warn-ignored` in lint-staged)
- [x] `.gitignore`: add `.turbo`, `out`, `*.tsbuildinfo`
- [x] `pnpm install`
- [x] validate: format:check, lint:root, turbo lint/typecheck/build
- [x] update context/docs

## Validation

- [x] `turbo run lint|typecheck|build` — all exit 0 for `web`
- [x] `pnpm format:check` / root `eslint .` — still pass, `apps/web` correctly ignored
- [x] `next build` output smoke-tested: `next start` + `curl localhost:3921/` → HTTP
      200, page contains the expected placeholder text
- [x] `git status` reviewed — no `.next`/`.turbo`/`node_modules` staged
- [n/a] `turbo test` — no test runner in `apps/web` yet (CR-008)

## Discovered issues

- Initially planned to hard-pin every new dependency to an exact version (matching
  `packageManager: pnpm@10.34.5`'s style), but root's actual `devDependencies` all use
  caret ranges (`^9.0.0` etc.) — pinning exactly would have been inconsistent with the
  established convention and would fight Dependabot's grouped update PRs for no benefit.
  Switched to caret ranges for everything except `typescript`, which has a real,
  narrow compatibility ceiling (see Requirements §2) worth pinning exactly.
- TypeScript 6.0.3 raises `TS2882` on the side-effect `import './globals.css'` that
  every Next.js App Router layout has — fixed with `src/css.d.ts`
  (`declare module '*.css'`). Not something older TS/tutorial-era Next projects
  would have hit.
- `next/typescript`'s ESLint preset flags `next-env.d.ts`'s own triple-slash reference
  (`@typescript-eslint/triple-slash-reference`) — that file is Next-generated and
  explicitly "should not be edited," so it's excluded via `ignores`, not fixed.
- Confirmed empirically (small throwaway test, not committed) that ESLint flat config
  resolves exactly one config file per invocation, chosen by process CWD — no
  per-file directory cascading. This is what forced the root `eslint.config.mjs`
  ignore-list change and produced KI-012 (lint-staged pre-commit gap for
  `apps/*`/`packages/*`, deferred to CR-010).
- Confirmed empirically that Prettier 3.9.6 reads `.gitignore` automatically, so
  adding `.turbo` there was sufficient — no separate `.prettierignore` entry needed.

## Final result

Done. `apps/web` exists and builds/typechecks/lints cleanly through `turbo`; smoke-
tested at runtime. Root tooling adjusted (ESLint ignores, `typescript` pin,
`.gitignore`) to accommodate the first real workspace member; the one accepted gap
(KI-012) is recorded with an owner (CR-010). `docs/tasks.md`, `known-issues.md`,
`project-state.md`, `architecture-map.md`, `docs/changelog.md` all updated. Next
logical task: CR-003 (Configure Fastify API).
