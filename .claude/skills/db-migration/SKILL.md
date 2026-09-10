---
name: db-migration
description: Use when changing the database schema — adding/altering/dropping a table or column, adding a constraint or index, or anything under packages/db. Triggers on "add a column", "create a table for X", "migrate the schema", "add a foreign key". Enforces rules/database.md so invariants (capacity, duplicate registration, ownership) stay protected at the DB level.
---

# Database Migration

Read first: `.claude/rules/database.md`, `docs/database.md`.

## Steps

1. **Inspect before changing.** Read the current schema in `packages/db`, existing
   migrations, and any relations/queries that touch the table(s) involved. Do not write a
   migration blind.

2. **Every schema change gets a real migration file** (via the project's migration
   tool) — never hand-edit a production schema, never skip generating a migration because
   the change "looks small."

3. **Protect invariants with constraints, not just application code:**
   - foreign keys for every real relationship (ride→organizer, registration→ride/user);
   - uniqueness/partial-unique constraints where duplicates must be impossible (e.g. one
     active registration per user per ride);
   - `NOT NULL` and check constraints for required/bounded fields (e.g. capacity ≥ 0).
   Application-level checks are a UX nicety on top of these, not a substitute.

4. **Indexes** based on actual query patterns you can point to (a filter, a join, a sort
   used in real code) — not speculative indexing.

5. **Private data.** If the change adds or exposes participant contact/emergency data,
   confirm access is restricted per `.claude/rules/database.md` and
   `.claude/rules/security.md` before considering this done.

6. **Reversibility.** Prefer additive, backward-compatible migrations (new nullable
   column, new table) over destructive ones when the app is mid-deploy. If a column/table
   must be dropped, confirm nothing else still reads it.

7. **Update `docs/database.md`** for any meaningful schema change — it should describe
   current reality, not go stale.

8. **Test** the migration applies cleanly on a fresh database and that existing
   tests/queries still pass against the new schema.

9. **Update context** per `docs/definition-of-done.md`: `docs/changelog.md` entry,
   `project-state.md` if this is a notable structural change.
