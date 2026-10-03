---
name: close-task
description: Use at the end of every non-trivial task, once the code is validated — "закрой задачу", "обнови контекст", "запиши в changelog", or when the Stop/PreCompact hook reminds that .claude/context/docs weren't updated. Runs CLAUDE.md's Context preservation protocol in one pass (project-state, changelog, tasks, known-issues, architecture-map, decisions) and produces the three-section end-of-run report.
---

# Close a task

This is CLAUDE.md steps 12–14 ("Update persistent project context", "Update
docs/tasks.md", "Review git diff"). Run it after validation passed — never to paper
over a failing check.

## Inputs

`.claude/context/current-task.md` (goal, acceptance criteria, validation results,
discovered issues), `git status` + `git diff --stat`, the last 3 entries of
`docs/changelog.md` (to match their format; respect its length limit).

## Steps

1. **Acceptance check.** Walk every acceptance criterion in `current-task.md`; each is
   met with evidence (test name, command output) or explicitly listed as not done.
2. **`docs/changelog.md`** — append (bottom) one entry per CR, the house format:
   `## YYYY-MM-DD — CR-XXX — title`, then `Summary:`, `Contract:` (API/types/ui
   changes or "none"), `Files:`, `Validation:` (real commands + counts),
   `Decisions:`, `Follow-up:`; Summary ≤ ~600 characters — narratives go in the commit
   body. Never edit past entries. If the live file has more than ~15 entries, archive
   per its own "Archiving" section.
3. **`docs/tasks.md`** — move the CR from "Open" to "Recently done" as one checked
   line (add it if it was never listed); keep ~8 there, older ones go to the bottom of
   `docs/tasks-archive.md`.
4. **`.claude/context/project-state.md`** — it is a snapshot: rewrite the
   "Current task", "In progress", "Next" and "Last updated" sections to the present,
   touching "Implemented" only if an area's one-line summary changed. Don't append
   history there — that is the changelog's job. Target ≤ ~150 lines; if a section has
   grown into a log, condense it (old text verbatim to
   `.claude/context/project-state-archive.md`).
5. **`known-issue` skill** for every KI discovered or resolved (resolved ones move to
   the archive now, not later).
6. **Only when relevant:** `.claude/context/architecture-map.md` (structure changed),
   `docs/decisions.md` via the `adr` skill (an architectural decision was made),
   `docs/api.md` (endpoint contract changed), `docs/design.md` (tokens/terms rules).
7. **`current-task.md`** — set "Final result"; keep it until the next task replaces it.
8. **Diff review** — `git diff` on everything touched; no unrelated changes, no
   debug leftovers, no secrets. Commit only if the user asked (`commit-push`).

## Report (reply in Russian, exactly these sections)

```
## Needs my input
## Changed
## Found
```

"Found" carries risks, debt, unconfirmed assumptions with file/line evidence, and
pending visual baselines.
