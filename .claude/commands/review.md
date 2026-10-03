# /review

Review only. Do not modify code.

Read:

- current task;
- product requirements;
- relevant architecture/rules (read the path-scoped `.claude/rules/*` for the touched
  areas explicitly);
- `.claude/rules/do-not-break.md` (whole — check the diff against every invariant);
- git diff.

Check:

- correctness;
- acceptance criteria;
- architecture;
- security;
- authorization;
- DB integrity;
- business rules;
- API contract;
- tests;
- types;
- regressions;
- complexity.

Findings:
CRITICAL / HIGH / MEDIUM / LOW.

Each finding must include file, problem, impact, recommendation.

If issues are found, the task is not clean.
If no issues are found: `LGTM`.
