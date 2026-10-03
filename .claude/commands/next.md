# /next

Do not implement.

Read targeted slices (`.claude/CLAUDE.md` → "Non-negotiable operating rule"), not whole
files:

- `project-state.md` → "Current task", "In progress", "Next";
- `docs/tasks.md` → "Open";
- `known-issues.md` headers (`grep -n '^### KI-'`), then the candidates' entries;
- `docs/changelog.md` → last 3 entries (avoid repeating or contradicting recent work);
- `architecture-map.md` → only the sections the candidate task touches;
- current git state; recent relevant code.

Select the single smallest logical next task.

Prefer tasks that:

- unblock other work;
- close known issues;
- follow dependencies;
- keep the project in a runnable state.

Return task ID, goal, dependencies, files likely affected, and acceptance criteria.
