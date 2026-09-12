# Current Task

## Status

done

## Task ID

CR-001 — Initialize pnpm/Turborepo monorepo

## Goal

Make the already-authored root tooling (`package.json`, `pnpm-workspace.yaml`,
`turbo.json`, root ESLint config, `.prettierrc`, Husky) actually operational:
generate the lockfile CI depends on, add the shared base TypeScript config
future packages will extend, and verify every root script (`lint:root`,
`format:check`, and the turbo-delegated `lint`/`typecheck`/`test`/`build`)
runs cleanly against zero workspace packages. Does not create `apps/*` or
`packages/*` content — that belongs to CR-002..CR-007, which this task's
`tsconfig.base.json` and lockfile exist to support.

## Requirements

1. `pnpm-lock.yaml` generated and committed (root devDependencies only, since
   no workspace member exists yet) so `pnpm install --frozen-lockfile` in CI
   stops failing (KI-008).
2. Root `tsconfig.base.json` with the shared compiler options apps/packages
   will extend later (strict mode, module resolution matching Next.js 15 +
   Fastify + Node 24).
3. Confirm `pnpm format:check`, `pnpm lint:root`, and `turbo lint / typecheck
/ test / build` all succeed (no-op is acceptable with zero packages, but
   they must not error).
4. Confirm the Husky pre-commit hook is actually wired up (`prepare` script
   ran, `core.hooksPath` set).
5. No pnpm binary is installed on this machine — use `npx pnpm@10.34.5` (the
   exact pinned version) rather than installing pnpm/corepack globally.

## Acceptance criteria

- `pnpm-lock.yaml` present, matches `package.json`;
- `tsconfig.base.json` added at repo root;
- `pnpm format:check`, `pnpm lint:root` exit 0;
- `turbo lint`, `turbo typecheck`, `turbo test`, `turbo build` exit 0 with
  zero packages;
- Husky hook installed (`git config core.hooksPath` → `.husky`);
- `architecture-map.md` "Current state" reflects that workspace tooling is
  now initialized (still no app/package content);
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `docs/changelog.md`
  updated;
- `git diff` reviewed before commit.

## Planned files

`pnpm-lock.yaml` (new), `tsconfig.base.json` (new),
`.claude/context/architecture-map.md`, `.claude/context/{project-state,
known-issues,current-task}.md`, `docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] generate lockfile via `npx pnpm@10.34.5 install` (no pnpm/corepack installed
      globally on this machine — used the pinned version through npx)
- [x] add `tsconfig.base.json` (strict shared options; module/moduleResolution
      deliberately left to each package's own config — Next.js vs Fastify differ)
- [x] add `.prettierignore` for `pnpm-lock.yaml` (machine-generated, not Prettier's to
      reformat)
- [x] verify format:check / lint:root / turbo lint|typecheck|test|build — all exit 0
      against zero workspace packages
- [x] verify Husky hook wiring — `prepare` ran, `core.hooksPath` → `.husky/_`
- [x] update architecture-map.md
- [x] update project-state.md / known-issues.md (KI-008 resolved) / docs/tasks.md
      (CR-001 checked off) / changelog.md

## Validation

- [x] `pnpm-lock.yaml` generated, `node_modules/.bin` populated
      (eslint/prettier/turbo/husky/lint-staged/tsc present)
- [x] `prettier --check .` — clean (after formatting current-task.md itself and
      ignoring the lockfile)
- [x] `eslint .` (root config) — no errors
- [x] `turbo run lint|typecheck|test|build` — each exits 0, correctly reports
      "0 packages" rather than erroring
- [x] `git config core.hooksPath` → `.husky/_` (Husky wired)
- [n/a] no actual app/package code to typecheck/test/build yet — that's CR-002..CR-007

## Discovered issues

None new. `npx pnpm` without a pinned version resolves to the latest pnpm (12.4.1 was
seen once) — always pin `pnpm@10.34.5` explicitly when invoking through npx, or prefer
`./node_modules/.bin/<tool>` directly once installed, to avoid version drift from the
`packageManager` field.

## Final result

Done. Root tooling is operational: lockfile committed, base tsconfig in place, all root
scripts and turbo tasks verified clean against zero packages, Husky hook confirmed
wired. `apps/*`/`packages/*` still do not exist. Next logical task: CR-002 (Configure
Next.js web).
