# Current task

## Task ID

Resolves KI-017 (`packages/db`/`packages/types`/`packages/maps-2gis` export raw
TS source, not compiled `dist` — confirmed live-blocking in CR-011) via a new
ADR-017, as a prerequisite for CR-074 (`docs/tasks.md` Deployment section,
first open ticket). Security foundations has no other unblocked work (only
CR-058 remains, blocked on KI-014) — Deployment is the next logical section,
and CR-074 (`Dockerfile` for `apps/web`/`apps/api`) cannot produce a working
image until `apps/api`'s production build actually boots under plain `node`,
which KI-017 documents as currently broken.

## Goal

`.claude/rules/architecture.md`'s change control requires an ADR before a
silent architecture/tooling change; KI-017's own "Next action" names this
exact choice — (a) switch `db`/`types` to declaration-based `dist` exports,
or (b) switch `apps/api`'s build to a bundler that inlines workspace source
— as needing "an explicit ADR, not a silent fix inside a feature ticket."

## Investigation

- Confirmed still broken: `packages/db`/`packages/types`/`packages/maps-2gis`
  all set `main`/`types`/`exports` to `./src/*.ts`. `tsx` (dev, tests) and
  `tsc` (typecheck/build-time type resolution) handle that fine; a plain
  `node dist/server.js` does not — `db`'s own compiled `client.ts` imports
  its sibling `schema/index.ts` with a `.js`-suffixed NodeNext-style
  specifier that Node's native `.ts` type-stripping loads literally (finds
  `client.ts` itself fine, since that's what `db`'s `exports` names) but
  does not rewrite to resolve the relative import — `ERR_MODULE_NOT_FOUND`.
  `apps/web` doesn't hit this (Next/webpack, not plain `node` — already
  fixed differently via `next.config.ts`'s `resolve.extensionAlias`).
- Option (a) (declaration-based `dist` exports on `db`/`types`) would need
  every consumer's dev flow (`tsx watch`, `vitest`) to keep resolving to
  fresh `src/*.ts` — not a stale prior build — which means either dual
  conditional exports (a "source"/dev condition vs. a `dist` condition) or a
  build step wired into every dev/test invocation. Both add real ongoing
  complexity to a path (dev/test) that works correctly today.
- Option (b) (bundle `apps/api`'s own build) touches nothing about how
  `db`/`types`/`maps-2gis` ship — their `exports` stay exactly as they are,
  dev/test flows (`tsx watch`, `vitest`) are completely unaffected — only
  `apps/api`'s own `build`/`start` scripts change. The only new artifact is
  a single bundled `dist/server.js` with workspace source inlined and real
  npm dependencies (`fastify`, `drizzle-orm`, `argon2`, `bullmq`, `ioredis`,
  `@aws-sdk/*`, `sax`, `zod`, ...) left external — never bundling third-party
  packages (especially `argon2`, a native addon — bundling a native binding
  is a known footgun, not just unnecessary work).
- No bundler (`esbuild`/`tsup`/etc.) exists anywhere in this repo today —
  Vite 8's own transform is oxc-based, not esbuild-backed (KI-018). Chose
  plain `esbuild` directly (not `tsup`): this is one bundle target with a
  fully custom `external` computation (see Decision), and `tsup` would only
  add a config layer on top of the exact same esbuild call for no benefit
  here.
- `apps/api`'s own `dependencies` list is not, by itself, the correct
  `external` set — `db`'s own runtime dependencies (`drizzle-orm`,
  `postgres`) aren't declared on `apps/api`'s `package.json` at all (only
  reachable transitively through the `db` workspace symlink today), and
  esbuild can't distinguish "workspace package" from "real npm package" via
  its built-in `packages: 'external'` option — pnpm symlinks both kinds
  under `node_modules` identically. The correct `external` set is the union
  of `dependencies` across `apps/api` + every workspace package actually
  being bundled into it (`db`, `types`, `resilience` — `maps-2gis`/
  `maps-core` are not `apps/api` dependencies today, nothing to bundle
  there), minus those workspace package names themselves.

## Decision

**ADR-017**: `apps/api`'s production build switches from `tsc -p
tsconfig.json` (type-emit only, the thing that's broken) to `esbuild`,
bundling `src/server.ts` plus every workspace dependency's source
(`db`, `types`, `resilience`) into one `dist/server.js`, while every real npm
dependency stays external (resolved from `node_modules` at runtime, exactly
as today). `db`/`types`/`maps-core`/`maps-2gis`/`resilience`'s own
`package.json` `exports`/`tsc`-based `build` scripts are untouched — this
fixes the one broken consumption path (`apps/api`'s compiled production
boot) without touching the dev/test path that already works for everyone
else, including `apps/api`'s own `dev`/`test` scripts (`tsx watch`/`vitest`,
unaffected — they never read `dist/`).

- New `apps/api/scripts/build.mjs`: computes `external` at build time from
  the union of `apps/api` + `db` + `types` + `resilience`'s own
  `package.json` `dependencies`, minus `{db, types, resilience}` — so it
  can't silently drift out of sync as dependencies change on either side.
  `bundle: true`, `platform: 'node'`, `format: 'esm'`, `sourcemap: true`,
  single `entryPoints: ['src/server.ts']` → `outfile: 'dist/server.js'`.
- `apps/api/package.json`'s `"build"` script becomes `node scripts/build.mjs`
  (was `tsc -p tsconfig.json`); `"typecheck"` stays `tsc --noEmit`
  (unaffected — type-checking and the runtime artifact are decoupled now,
  same as they conceptually already were).
- Re-run the exact `NODE_ENV=production node dist/server.js` smoke test
  KI-017/CR-011 originally used, against a real Postgres, to prove this
  actually fixes the boot crash rather than just building without error.

## Requirements / acceptance criteria

- `pnpm --filter api build` succeeds and produces `dist/server.js`.
- `NODE_ENV=production node dist/server.js` (with real env vars) boots
  without `ERR_MODULE_NOT_FOUND` or any other crash, and `/health` responds.
- `apps/api`'s `dev`/`typecheck`/`test` scripts are provably unaffected — full
  test suite still passes, `tsx watch` still works.
- `db`/`types`/`maps-core`/`maps-2gis`/`resilience` have zero changes.
- Native/binary dependencies (`argon2`, `@aws-sdk/client-s3`'s deps) are never
  bundled — confirmed by inspecting the `external` list actually used.
- ADR-017 recorded in `docs/decisions.md`; KI-017 marked resolved in
  `known-issues.md`.

## Planned files

- `apps/api/package.json` (new `esbuild` devDependency, `build` script),
  `apps/api/scripts/build.mjs` (new).
- `docs/decisions.md` (ADR-017), `.claude/context/known-issues.md` (KI-017
  resolved), `.claude/rules/architecture.md` if the bundler needs a
  dependency-direction note, `docs/tasks.md`, `.claude/context/project-state.md`,
  `docs/changelog.md`.

## Implementation progress

- [x] Add `esbuild`, write `scripts/build.mjs`, wire into `package.json`.
- [x] Verify `pnpm --filter api build` + real boot under plain `node`
      (the actual regression test for KI-017).
- [x] Verify `external` excludes only real npm deps, includes `db`/`types`/
      `resilience` source inlined (inspected the bundle, didn't just assume)
      — found and fixed a real second gap (`postgres` needed as a direct
      `apps/api` dependency, not just `external`, under pnpm's strict
      `node_modules`).
- [x] Full `apps/api` test suite + `pnpm turbo run lint typecheck build`
      across the repo — proved zero effect on dev/test paths.
- [x] ADR-017 + KI-017 resolution + docs/context updates.

## Validation results

`pnpm turbo run lint typecheck build` — 24/24 tasks clean. `apps/api` full
suite: 283/283 passing, unaffected. Live regression test: `NODE_ENV=test
node dist/server.js` against this environment's real local Postgres booted
cleanly (the exact `ERR_MODULE_NOT_FOUND` crash is gone), `GET /health`
responded, and `POST /v1/auth/register` round-tripped end to end through the
bundle (argon2, Drizzle, helmet, rate limiting) with `201 Created`.
Separately confirmed `NODE_ENV=production` with local-only config still
correctly hits the unrelated CR-073 placeholder guard, not conflated with
this fix. Inspected `dist/server.js` directly: `argon2` stayed a genuine
external `import` (not inlined), `db`'s exported symbols
(`createDbClient`, `passwordResetTokens`) were present in the output
(inlined). Dev server and log files cleaned up afterward.

## Discovered issues

None new beyond the `postgres`-must-be-a-direct-dependency gap this task
itself found and fixed (documented in ADR-017, KI-017's resolution, and
`build.mjs`'s own comment — not left implicit).

## Final result

Resolved. `apps/api`'s production build now bundles `db`/`types`/
`resilience`'s source via `esbuild` into `dist/server.js`
(`apps/api/scripts/build.mjs`, ADR-017), fixing the `ERR_MODULE_NOT_FOUND`
crash KI-017 documented since CR-011. Every real npm dependency (including
the native `argon2` addon) stays external. `db`/`types`/`maps-core`/
`maps-2gis`/`resilience` and every dev/test path are completely unaffected.
CR-074 (Dockerfile for `apps/web`/`apps/api`, the first open Deployment
ticket) can now proceed with a real, working production boot to
containerize. Next logical task: CR-074.
