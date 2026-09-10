---
name: adr
description: Use when a real architectural decision is being made or reconsidered — e.g. "should we use X or Y for Z", "let's decide on the session store", "we need to pick a notification provider". Ensures the decision is recorded in docs/decisions.md the same way every prior ADR in this project was — append-only, with status and rationale — instead of just changing code and leaving no trace of why.
---

# Recording an ADR

Read first: `docs/decisions.md` (see existing ADR-001 through ADR-010 for the expected
format and level of detail) and `.claude/CLAUDE.md`'s context-preservation section.

## When this applies

A decision is architectural (needs an ADR) if it affects: the stack, a cross-cutting
pattern (auth, resilience, extensibility, maps provider), a data model invariant, or
anything future work would otherwise silently assume without being told. A local
implementation choice inside one feature module usually does not need one.

## Steps

1. **Check if this supersedes an existing ADR.** If so, do not delete or rewrite the old
   entry — mark its `Status:` line as superseded, with the date and a one-line pointer to
   the new ADR/changelog entry, then add the new ADR below it. This is the same pattern
   used for ADR-003 (Yandex → 2GIS) and ADR-006 (Pending stub → concrete architecture).

2. **Write the new/updated ADR** with:
   - a short title;
   - `Status:` (Accepted / Pending / Superseded, with date if superseded);
   - the decision itself, stated plainly;
   - rationale — why this and not the alternatives, briefly;
   - what it does NOT mean, if the decision could be misread as broader than intended
     (see ADR-008's "What this does NOT mean" section for the pattern);
   - when to revisit it, if relevant.

3. **Cross-link.** If a `.claude/rules/*.md` file should encode the operational details
   of this decision (the way `resilience.md`, `security.md`, `extensibility.md`, and
   `maps.md` do for ADR-008/006/009/010), create or update it and link both directions.

4. **Add a `docs/changelog.md` entry** for the decision itself, separate from whatever
   implementation work follows.

5. **If the decision changes the backlog**, add/update the relevant `docs/tasks.md`
   entries rather than letting the ADR imply work that isn't tracked anywhere.
