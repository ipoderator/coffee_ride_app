---
name: ci-triage
description: Use when GitHub Actions is red or the user asks why — "CI упал", "красный main", "почини CI", "check the CI run", or after a push whose run failed. Pulls the failed log, classifies the failure into one of this repo's known classes (format, lint, typecheck, unit, coverage gate, e2e, screenshots, docker-smoke) and applies that class's known fix path instead of re-debugging from scratch.
---

# CI triage

Workflows: `.github/workflows/ci.yml` (jobs `ci`, `docker-smoke`),
`load-test.yml` (manual/nightly), `maps-contract.yml` (weekly, protected env).

## Steps

1. `gh run list -L 5` (branch of interest), then `gh run view <id> --log-failed`
   (pipe through `tail -200`; don't dump the full log). Note the first failing step.
2. Classify by step and apply the known path:

| Failing step             | Usual cause                                     | Fix path                                                                                                                |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Format check             | Prettier drift                                  | `pnpm prettier --write <files>`; commit as `style:`                                                                     |
| Lint (root / workspaces) | rule hit, skill scripts in root lint (CR-153)   | fix the code; never disable the rule globally                                                                           |
| Typecheck                | contract change not propagated to both cabinets | fix every caller (`.claude/rules/extensibility.md`)                                                                     |
| Test (with coverage)     | real failure, or env-only (Redis/S3 flags)      | reproduce locally with the CI env (memory: coverage needs live stack); flaky → fix the race, don't retry                |
| Coverage gate            | new code without tests, or a skipped live suite | add tests; baseline only rises (`.claude/rules/testing.md` → Coverage); never `--allow-decrease` without the owner      |
| E2E — screenshot diff    | intended UI change or stale baseline            | `visual-baselines` skill (path B uses this run's artifact)                                                              |
| E2E — functional         | real regression, port clash, seed collision     | `gh run download <id> -n playwright-report`, read the trace/error-context; reproduce with `E2E_WEB_PORT`/`E2E_API_PORT` |
| Production Docker smoke  | Dockerfile/compose/env drift                    | `pnpm smoke:docker` locally if Docker is up                                                                             |
| Dependabot PR only       | major bump                                      | `dependabot-triage` skill                                                                                               |

3. Reproduce the narrowest failing check locally before changing anything; fix the
   root cause (CLAUDE.md self-correction protocol), re-run it and the related checks.
4. Push and confirm the next run. To wait for it, don't poll in a tight loop — use
   Monitor on `gh run watch <id> --exit-status` or one `ScheduleWakeup` sized to the
   run (~10–15 min for `ci`).
5. A recurring/environment-only failure → record it with `known-issue`; a fixed one
   gets a changelog line (`close-task`).
