# /next

Do not implement.

Read:

- `.claude/context/project-state.md`;
- `.claude/context/architecture-map.md`;
- `.claude/context/known-issues.md`;
- `docs/tasks.md`;
- `docs/changelog.md` (last 5-10 entries, to avoid repeating or contradicting recent work);
- current git state;
- recent relevant code.

Select the single smallest logical next task.

Prefer tasks that:

- unblock other work;
- close known issues;
- follow dependencies;
- keep the project in a runnable state.

Return task ID, goal, dependencies, files likely affected, and acceptance criteria.
