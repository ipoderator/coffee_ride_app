# Current Task

## Status

done

## Task ID

CR-004 — Configure PostgreSQL + Drizzle

## Goal

Scaffold `packages/db`: Drizzle ORM + Postgres driver, migration tooling
(`drizzle-kit`), a connection-factory client. Tooling only — zero domain tables.
Asked the user directly (one focused question, not a full `/grill-me` round):
empty schema (packages/db owns client + migrations, no tables) vs shipping a first
`users` table now. User picked the recommended option: **empty schema**. The
`users` table (and every other domain table) is added later via the
`db-migration` skill, at the point a real feature (starting CR-011, User
registration) actually needs it — mirrors how CR-002/CR-003 shipped zero domain
routes/screens.

## Requirements

1. `packages/db` matches `pnpm-workspace.yaml` (`packages/*`).
2. Versions checked against npm registry: `drizzle-orm@^0.45.2`,
   `drizzle-kit@^0.31.10` (dev), Postgres driver `postgres@^3.4.9` (postgres.js —
   Drizzle's currently favored driver for plain Postgres, lighter than `pg`),
   `typescript` pinned exactly `6.0.3` (same ceiling as `apps/web`/`apps/api`),
   `tsx` (for the migrate script), `@types/node`, `eslint` + own flat config
   (mirrors `apps/api`'s pattern — `packages/config` doesn't exist yet, CR-007).
3. `src/schema/index.ts`: empty schema module (documents the per-entity-file
   convention for when tables are added), `src/client.ts`: `createDbClient(
connectionString)` factory (a factory, not a global singleton reading
   `process.env` itself — `packages/db` is a library, `apps/api` owns env
   validation per `.claude/rules/architecture.md`'s dependency direction).
   `src/migrate.ts`: standalone script applying pending migrations (used by
   CR-076's deploy step later, and to validate this task now).
4. `drizzle.config.ts` — dialect `postgresql`, schema path, migrations output
   folder, reads `DATABASE_URL` from the environment only for drizzle-kit's own
   CLI invocation (not committed anywhere as a value).
5. Every migration is a real generated file (`drizzle-kit generate`), never
   `drizzle-kit push` (`.claude/rules/database.md`: "every schema change requires
   a migration").
6. `apps/api`/`apps/web` are NOT wired to depend on `packages/db` in this task —
   that starts when a real route needs it (CR-011). Keeps this task's diff scoped
   to the package itself, like CR-002/CR-003 didn't touch each other.
7. Validate the full pipeline for real, not just typecheck: since the committed
   schema has zero tables, temporarily add one scratch table, run `docker compose
up postgres`, `drizzle-kit generate`, apply via the migrate script, confirm via
   `psql` that the table exists, then remove the scratch table, its generated
   migration file(s)/journal, and drop it from the live DB — committed state ends
   with zero tables/migrations, same discipline as CR-002/CR-003's temporary test
   routes.

## Acceptance criteria

- `packages/db` builds/typechecks/lints cleanly via `turbo`;
- `drizzle-kit generate` runs cleanly against the empty schema (no error, no
  spurious migration);
- proven live: a scratch table can be generated, migrated onto the real
  docker-compose Postgres, and queried — then fully removed before commit;
- `pnpm lint:root` / `format:check` still pass at the repo root; `apps/web`/
  `apps/api` stay green (regression check);
- `docs/database.md` still accurately describes reality (still true — no tables
  changed);
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `architecture-map.md`,
  `docs/changelog.md` updated;
- `git diff` reviewed — no scratch migration/table artifacts, no `dist`/
  `node_modules`/`.env` committed.

## Planned files

`packages/db/package.json`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`,
`drizzle.config.ts`, `src/schema/index.ts`, `src/client.ts`, `src/migrate.ts`;
`.claude/context/{project-state,architecture-map,known-issues,current-task}.md`,
`docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] asked scope question, user picked empty-schema (recommended)
- [x] scaffold `packages/db` files
- [x] `pnpm install`
- [x] validate live against a real Postgres (scratch table, then removed) —
      Docker daemon didn't come up in this environment, used local Homebrew
      Postgres 14 instead (same protocol/dialect, sufficient to prove the
      pipeline)
- [x] update context/docs

## Validation

- [x] `turbo run lint|typecheck|build` — all exit 0 for `db`; `web`/`api` stay green
- [x] `pnpm format:check` / root `eslint .` — still pass
- [x] `drizzle-kit generate` on the empty (committed) schema: "0 tables", no
      spurious migration file, only the initial empty
      `migrations/meta/_journal.json`
- [x] scratch validation: added a throwaway table → `drizzle-kit generate`
      produced a real SQL migration → applied via `src/migrate.ts` → confirmed
      via `psql` (`\d`, insert, select) AND via `createDbClient` + Drizzle
      query (proves the client factory + schema typing, not just raw SQL) →
      removed the table from schema, deleted the scratch migration file, and
      dropped the scratch database
- [x] `git status` reviewed — no `dist`/scratch migration/`.env` staged
- [n/a] `turbo test` — no test runner in `packages/db` yet (CR-008)

## Discovered issues

- Docker Desktop's daemon did not come up within several minutes in this
  environment (`docker compose up postgres` failed to connect; `open -a
Docker` + waiting didn't help). Used the machine's existing local Homebrew
  PostgreSQL 14 instance with a scratch database instead — real Postgres, same
  wire protocol, sufficient to validate Drizzle/drizzle-kit end-to-end. Not
  filed as a KI: this is an environment quirk of this session, not a defect in
  the repo's `docker-compose.yml`.
- TypeScript's automatic `@types` inclusion did not pick up Node's ambient
  globals (`process`/`console`/`URL`/`import.meta.url`) in `src/migrate.ts`
  despite `@types/node` being correctly installed — needed an explicit
  `"types": ["node"]` in `packages/db/tsconfig.json`. `apps/api` never hit this
  because every file there already imports something from `fastify` (which
  references Node builtin types), incidentally pulling `@types/node` in;
  `migrate.ts` uses only bare globals, no `node:`-prefixed import. Filed as
  KI-013 — CR-007 should centralize this into the shared Node tsconfig
  fragment `packages/config` will own.
- `drizzle.config.ts` can't live in the same `tsc` program as `src/**` (its
  `rootDir: "src"` conflicts with a file outside `src/`) — removed it from
  `tsconfig.json`'s `include`; `drizzle-kit` transpiles/runs its own config
  file independently, so it doesn't need our program to include it, and ESLint
  still lints it separately (not tied to the tsconfig's `include`).

## Final result

Done. `packages/db` exists with zero domain tables (by design, confirmed with
the user); the full Drizzle/drizzle-kit/Postgres pipeline was proven live with a
scratch table, then fully cleaned up. `apps/api`/`apps/web` are untouched —
`packages/db` isn't consumed anywhere yet, deliberately (CR-011 wires it in).
`docs/tasks.md` (CR-004), `known-issues.md` (KI-013), `project-state.md`,
`architecture-map.md`, `docs/changelog.md`, `.prettierignore` all updated. Next
logical task: CR-005 (Configure Redis).
