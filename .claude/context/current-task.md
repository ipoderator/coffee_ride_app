# Current Task

## Status

done

## Task ID

CR-003 — Configure Fastify API

## Goal

Scaffold `apps/api` as the second workspace member: Fastify 5 + TypeScript (ESM),
Zod request/env validation, RFC 9457 error envelope, `/v1` versioning convention,
OpenAPI generation infrastructure. Framework/tooling layer only — zero real domain
routes (first is CR-011). Includes CR-073 (Zod env validation, refuse boot in
production on placeholder values), as the backlog entry for CR-073 specifies.

Decisions locked via `/grill-me` before implementation (all recommended options
accepted by the user):

1. **ESM**, not CommonJS (`"type": "module"`, `moduleResolution: NodeNext`).
2. **OpenAPI wired now**, not deferred: `@fastify/swagger` + `@fastify/swagger-ui` +
   `@fastify/type-provider-zod` (the official `fastify/fastify-type-provider-zod`
   package, not the community `turkerdev/fastify-type-provider-zod` it superseded —
   confirmed via npm registry `repository.url`).
3. **`GET /health` stub now**: returns `{ status: 'ok' }`, no dependency checks.
   CR-051 later replaces the handler body with real DB/Redis/S3 checks — same route,
   same contract position (unversioned, per ADR-011/docs/api.md).
4. **RFC 9457 `type` base URI**: `https://coffee-ride.example/errors/{code}`,
   matching ADR-011's own example verbatim (not `about:blank`).
5. **`API_PORT=4000`** (not bare `PORT` — avoids ambiguity with `apps/web`'s own
   port in a shared `.env`).
6. **Env validation (CR-073) covers the full `.env.example` schema now**, including
   vars no code reads yet (`DATABASE_URL`, `REDIS_URL`, `S3_*`,
   `MAPS_2GIS_API_KEY`) — refuses to boot when `NODE_ENV=production` and a value
   matches a known placeholder (`change-me`, `minio`, `minio12345`, etc.). Schema
   grows as future CRs add variables.

## Requirements

1. `apps/api` matches `pnpm-workspace.yaml` and turbo.json's task expectations
   (`dev`, `build`, `lint`, `typecheck`; no `test` yet — CR-008).
2. Versions checked against the npm registry before writing (same discipline as
   CR-002): `fastify@^5.12.4`, `zod@^4.6.2`, `@fastify/type-provider-zod@^1.0.0`,
   `@fastify/swagger@^9.8.1`, `@fastify/swagger-ui@^6.1.1`, `pino-pretty@^13.1.3`
   (dev-only, pretty logs outside production), `tsx@^4.23.13` (dev server/watch),
   `typescript` pinned exactly to `6.0.3` (same `typescript-eslint` ceiling as
   `apps/web` — see CR-002), `@types/node@^24.13.4`, `eslint@^9.0.0`.
3. `route/controller → validation → use case/service → repository/db` layering
   (`.claude/rules/backend.md`) — even with no domain routes yet, the plugin/module
   structure should not have to be reshaped when CR-011 adds the first one.
4. Global error handler producing the exact RFC 9457 shape from `docs/api.md`
   (`type`/`title`/`status`/`detail`/`instance`/`code`/`errors[]`), including Zod
   validation failures mapped into `errors[]`. Never leak stack traces / DB
   internals in `detail` (`.claude/rules/backend.md`).
5. `/v1` prefix wired structurally now (an empty versioned plugin), `/health`
   outside it, matching ADR-011.
6. Zod-validated env module, fails fast with a clear message on missing values
   always, and on placeholder values specifically when `NODE_ENV=production`.
7. No CORS plugin (ADR-013: single origin, none supported). No rate limiting yet
   (`.claude/rules/security.md`: applies "from the first auth-related task
   (CR-011/CR-012) onward" — no Redis client exists yet, CR-005).
8. `apps/api/eslint.config.mjs`: own flat config (plain `typescript-eslint`
   recommended, no framework-specific plugin needed) — root `eslint.config.mjs`
   already ignores `apps/**`/`packages/**` (CR-002), so this is required, not
   optional, for `turbo lint` to check this package at all.
9. `pnpm format:check`, `pnpm lint:root`, `turbo run lint|typecheck|build` must all
   pass with `apps/api` in scope; `apps/web`'s checks must remain green too
   (regression check, not just the new package).

## Acceptance criteria

- `apps/api` builds and typechecks cleanly via `turbo`;
- `turbo lint` passes for `apps/api` using its own config;
- server boots locally, `GET /health` returns 200 `{ status: 'ok' }`;
- a request validation failure and a 404 both return the documented
  `application/problem+json` shape;
- env module rejects a missing required var and (in a simulated production run)
  a known placeholder value, with a clear non-leaking error message;
- `pnpm lint:root` / `format:check` still pass at the repo root;
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `architecture-map.md`,
  `docs/changelog.md` updated;
- `git diff` reviewed, no `dist`/`node_modules`/`.env` committed.

## Planned files

`apps/api/package.json`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`,
`src/env.ts`, `src/app.ts`, `src/server.ts`, `src/plugins/error-handler.ts`,
`src/plugins/openapi.ts`, `src/routes/health.ts`, `src/routes/v1.ts`;
`.env.example` (`API_PORT`), `turbo.json` (env list), `.claude/context/{project-state,
architecture-map,known-issues,current-task}.md`, `docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] grilled scope/decisions with the user, all recommended options accepted
- [x] scaffold `apps/api` files
- [x] `.env.example` (`API_PORT`) / `turbo.json` (`API_PORT` in every env list)
- [x] `pnpm install`
- [x] validate: boot server, curl `/health` and an error case, turbo lint/typecheck/build
- [x] update context/docs

## Validation

- [x] `turbo run lint|typecheck|build` — all exit 0 for `api`; `web` stays green
- [x] `pnpm format:check` / root `eslint .` — still pass
- [x] `tsx watch` dev boot: `GET /health` → 200 `{"status":"ok"}`
- [x] unknown route → 404, correct RFC 9457 envelope (`code: "not_found"`)
- [x] temporary Zod-validated test route with a bad payload → 400,
      `errors: [{ path: "name", message: "..." }]` correctly populated; route
      removed before commit, never shipped
- [x] `dist/server.js` (compiled build, not `tsx`) boots identically, `/health` 200
- [x] simulated production boot with `AUTH_SECRET=change-me` → refuses with the
      expected message; a boot missing `AUTH_SECRET` entirely also refuses
- [x] `git status` reviewed — no `dist`/`.env`/`node_modules` staged
- [n/a] `turbo test` — no test runner in `apps/api` yet (CR-008)

## Discovered issues

- Fastify 5's `setErrorHandler` callback needed an explicit `FastifyError` type
  annotation on the `error` parameter — inferred as `unknown` otherwise (TS18046)
  under this `withTypeProvider<ZodTypeProvider>()` setup, unlike untyped Fastify
  apps where it's usually inferred automatically.
- Node has no built-in `.env` auto-loading tied to a script's location; used
  `process.loadEnvFile()` (stable since Node 20.6) pointed explicitly at the repo
  root `.env` via `import.meta.dirname`, since the process's CWD is `apps/api`
  (turbo runs each package's script from inside that package), not the repo root
  where `.env.example`/`.env` live.
- `@fastify/type-provider-zod` is the official, actively maintained package
  (`fastify/fastify-type-provider-zod` on GitHub) — the unscoped
  `fastify-type-provider-zod` (`turkerdev/...`) it was migrated from is now
  effectively legacy. Worth remembering for any future doc/tutorial that still
  references the unscoped name.
- `pnpm install` reported "Ignored build scripts: esbuild, unrs-resolver" (pnpm's
  default script-approval gate). `tsx`/esbuild worked fine anyway in this
  environment (esbuild ships prebuilt platform binaries as optional
  dependencies, not solely via its own postinstall script) — noted here in case
  a future environment behaves differently; not blocking, not filed as a KI.

## Final result

Done. `apps/api` exists, boots, and was exercised live (not just typechecked) for
its health route, 404 handling, Zod validation error mapping, compiled-build
parity, and production placeholder rejection. Root tooling needed no further
adjustment beyond what CR-002 already established (root `eslint.config.mjs`
already ignored `apps/**`). `docs/tasks.md` (CR-003 and CR-073), `known-issues.md`
(none new), `project-state.md`, `architecture-map.md`, `docs/changelog.md` all
updated. Next logical task: CR-004 (Configure PostgreSQL + Drizzle).
