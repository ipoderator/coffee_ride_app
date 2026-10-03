# /plan

Planning only. Do not modify application code.

1. Read persistent context (targeted slices — `.claude/CLAUDE.md` → "Non-negotiable
   operating rule").
2. Inspect repository and recent changes.
3. Read the relevant sections of product/architecture docs and the `.claude/rules/*`
   files for the areas the plan touches (path-scoped rules are not loaded yet while
   planning).
4. Identify current behavior and gaps.
5. Produce:
   - goal;
   - assumptions;
   - implementation steps;
   - files to create/change;
   - DB/API implications;
   - tests;
   - risks;
   - acceptance criteria.
6. Write/update `.claude/context/current-task.md`.
7. Stop and wait for approval.

Do not implement before approval.
