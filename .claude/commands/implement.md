# /implement

Implement the approved task.

1. Read current task/context.
2. Inspect all relevant files.
3. Implement incrementally.
4. Keep scope limited to the approved task.
5. Add/update tests.
6. Run relevant tests.
7. Run typecheck.
8. Run lint.
9. Run build when relevant.
10. Review git diff.
11. Fix all actionable errors/findings.
12. Repeat validation after fixes.
13. Update persistent context and task status:
    - overwrite `.claude/context/project-state.md`;
    - append an entry to `docs/changelog.md`;
    - check off the task in `docs/tasks.md`;
    - update `.claude/context/architecture-map.md` if structure changed;
    - append an ADR to `docs/decisions.md` if an architectural decision was made.
14. Report exact changes and actual checks.

If blocked, document the blocker and stop.
Do not fake success.
