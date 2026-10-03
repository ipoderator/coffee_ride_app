## 2026-10-03 — CR-204 — Close the two context gaps CR-202/203 opened

Summary: the owner asked whether targeted reads hurt understanding. Two real gaps: a keyword grep of the "Do not break" list can miss an invariant worded differently from the task, and reading only the last 3 changelog entries misses older decisions about the area being changed. `do-not-break.md` moved to `.claude/rules/` with `paths:` on code/infra/CI, so it loads whole (~3k tokens) whenever such a file is touched; the read protocol gained a step to grep the touched files/module in the changelog and its archive.
Contract: none (harness/docs only).
Files: `.claude/rules/do-not-break.md` (moved from `.claude/context/`), `.claude/CLAUDE.md`, `.claude/commands/review.md`, `.claude/skills/close-task/SKILL.md`, `.claude/context/project-state.md`, `docs/tasks.md`, `docs/tasks-archive.md`.
Validation: Prettier clean; the history grep example run against the real changelog files.
Decisions: none.
Follow-up: none.
