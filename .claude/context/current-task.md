# Current task

## Task ID

CR-078 — PostgreSQL backups + a restore actually verified, not just scheduled
(`docs/tasks.md` Deployment section).

## Goal

Close the last-but-one open Deployment-section ticket before CR-080/081/082:
a backup mechanism for whichever Postgres instance the app points at
(`DATABASE_URL`), plus proof — not just a script that looks right — that a
backup taken from it can actually be restored into a working database.

## Investigation

- `docker-compose.prod.yml` (ADR-018) deliberately runs no Postgres service
  of its own — production Postgres is assumed externally provisioned, host
  undecided. So this ticket cannot be "add a `pg_dump` sidecar container to
  a compose file this repo doesn't control" — it has to be a
  connection-string-driven script an operator can point at whatever Postgres
  they actually run, the same shape `packages/db/src/migrate.ts` already
  uses (reads `DATABASE_URL` directly, no assumption about hosting).
- This environment is unusual relative to KI-014/KI-015/KI-019 (Redis/S3/
  Docker all unreachable): a real local Postgres **is** reachable at
  `localhost:5432` (`pg_isready` succeeds; `.env`'s `DATABASE_URL` points at
  a real `coffee_ride_dev` database) — `pg_dump`/`pg_restore`/`psql` are all
  on `PATH` (Homebrew). This is the one Deployment ticket in the current
  backlog where "restore actually verified" is achievable live, not just
  documented as blocked — worth doing now rather than deferring further.
- No existing `docs/deployment.md` — `docs/database.md` is the doc that
  already owns the data model/time rules for `packages/db`; a "Backups"
  section there is the natural home, same precedent as ADR-012's time rules
  living there already.
- `packages/db/package.json` already has a `scripts/` convention absent
  (unlike `apps/api/scripts/build.mjs`) — adding `packages/db/scripts/` for
  `backup.sh`/`restore.sh`, invoked via new `db:backup`/`db:restore` package
  scripts, mirrors `db:migrate`'s existing "plain script, not a framework"
  shape.

## Decision

- Two plain shell scripts, not a new npm dependency or framework:
  `packages/db/scripts/backup.sh` (`pg_dump --format=custom`, timestamped
  filename, optional `BACKUP_RETENTION_DAYS` pruning) and
  `packages/db/scripts/restore.sh` (`pg_restore --clean --if-exists`, takes
  a backup file path). Both read `DATABASE_URL` the same way
  `migrate.ts` does — portable to wherever Postgres actually runs, no
  hosting assumption baked in.
- Backup _destination_ (local disk vs. S3/offsite sync) is deliberately left
  to the operator, same reasoning ADR-018 already used for Postgres hosting
  itself — `BACKUP_DIR` is just a local directory the script writes into;
  wiring that to real offsite storage is a hosting-specific decision this
  repo can't make for an undecided host.
- Document a cron-based schedule example (not a new service/container —
  same "boring, explicit architecture" preference `docs/decisions.md`
  already applies elsewhere) in `docs/database.md`'s new "Backups" section.
- Verify restore for real: back up the live local `coffee_ride_dev`
  database, restore into a fresh scratch database, compare row counts
  across every real table, then drop the scratch database. This is what
  the ticket's own title ("a restore actually verified, not just
  scheduled") demands — do not skip it just because it's inconvenient.

## Requirements / acceptance criteria

- `packages/db/scripts/backup.sh` produces a `pg_restore`-compatible dump
  from `DATABASE_URL`, with retention pruning.
- `packages/db/scripts/restore.sh` restores a dump produced by `backup.sh`
  into a target `DATABASE_URL`.
- A real restore was executed against a real Postgres in this session and
  its data verified to match the source (not just "the command exited 0").
- `docs/database.md` documents the backup/restore procedure and a cron
  scheduling example.
- No change to `docker-compose.prod.yml`/ADR-018 — backup destination stays
  operator-decided, consistent with Postgres hosting being undecided there.
- `pnpm turbo run lint typecheck build test` stays green (no application
  source touched).

## Planned files

- `packages/db/scripts/backup.sh` (new)
- `packages/db/scripts/restore.sh` (new)
- `packages/db/package.json` (`db:backup`/`db:restore` scripts)
- `docs/database.md` (new "Backups" section)
- `docs/tasks.md` (check off CR-078)
- `docs/changelog.md` (append)
- `.claude/context/project-state.md` (overwrite)
- `.claude/context/known-issues.md` (only if a real gap is found)

## Implementation progress

- [x] Write `backup.sh`/`restore.sh`.
- [x] Wire `db:backup`/`db:restore` package scripts.
- [x] Document in `docs/database.md`.
- [x] Live-verify: backup real dev DB, restore into scratch DB, compare.
- [x] `pnpm turbo run lint typecheck build test`.
- [x] Update docs/context, review `git diff`.

## Validation results

- Inserted a marker row into the real local `coffee_ride_dev` database,
  ran `pnpm --filter db db:backup`, restored the produced `.dump` into a
  throwaway scratch database (`coffee_ride_cr078_restore_test`) via
  `restore.sh`. Compared `count(*)` across all 14 real tables between
  source and restored database: every one matched exactly (13 at `0`,
  `users` at `1`). Separately confirmed the marker row's `id`/`email`/
  `display_name` were byte-identical between the two databases. Cleaned up:
  deleted the marker row from the real dev database, dropped the scratch
  database, deleted the test `.dump` file.
- `pnpm turbo run lint typecheck build test --filter='!web'` (with
  `DATABASE_URL` sourced): 25/25 tasks green, 299/299 `apps/api` tests
  passing.
- `apps/web` build run separately, `NODE_ENV=production pnpm --filter web
build` (KI-038's documented workaround — `next build` crashes under an
  inherited `NODE_ENV=development` when `.env` is sourced into the same
  shell): succeeded, all 14 routes generated.

## Discovered issues

None new. Re-hit the already-documented KI-038 (`next build` vs. an
inherited `NODE_ENV=development`) — not a regression, resolved by its own
existing workaround.

## Final result

CR-078 closed. `packages/db/scripts/backup.sh`/`restore.sh` exist, are
documented in `docs/database.md`, and a real restore was verified end to
end against this environment's live Postgres — not just "the script exits
0". `docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`
all updated. No new known issues. Next logical task: CR-080 (CI gaps),
CR-081 (env vars + deployment docs), or CR-082 (pin MinIO/base images) —
no fixed order decided yet.
