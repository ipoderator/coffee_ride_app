# Current task — CR-266 — CI split into parallel jobs

Source: owner, 2026-10-14/15 («можем как-то ускорить github action?» → point 1 of the
proposal). Branch `chore/ci-parallel-jobs`, PR #70.

## Goal

Cut CI wall time (~12 min) without touching branch protection.

## Requirements / acceptance criteria

- format/lint/typecheck/build, unit+coverage and e2e run as parallel jobs — done;
- the required status check `ci` stays and fails if any job fails or is skipped — done
  (gate job, `if: always()`);
- coverage gate, coverage and Playwright artifacts unchanged — done;
- `docker-smoke` untouched — done.

## Files

`.github/workflows/ci.yml`; `.claude/skills/ci-triage/SKILL.md`,
`.claude/skills/visual-baselines/SKILL.md`.

## Validation

actionlint 1.7.12 clean; prettier; YAML aliases resolve (parsed); PR #70 run 4:56 —
unit 4:47, checks 2:19, e2e 3:52, docker-smoke 3:36, gate green.

## Discovered issues

The `unit` job is now the critical path (apps/api suite runs file by file) → CR-267.

## Final result

Implemented and validated on PR #70.
