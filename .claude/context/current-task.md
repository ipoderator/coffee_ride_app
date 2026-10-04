# Current task — CR-209: the auth coverage gate reddens `ci` on unrelated commits — IN PROGRESS

Source: owner — "Приоритет №1 — main красный, и это блокирует всё остальное". Branch
`main`. CR-208 (Dependabot) is paused behind this: every bump PR inherits the same red
gate, and `ip-address@10.7.3`'s quarantine does not expire until 2026-10-05 ~10:35Z.

## Goal

Make `ci` green on `main` by fixing the real cause of the auth coverage drop, without
lowering the baseline.

## Root cause (found, reproduced locally)

`main` is red at `463a86b` (run 37190099752) on the coverage gate:

```
apps/api/src/modules/auth/ lines: 95.16% < baseline 95.59%
                     statements: 94.74% < baseline 95.06%
                       branches: 80.30% < baseline 80.64%
```

`463a86b` changes one markdown file, so the drop is not the commit's content.

**CR-208's note said this was a `push` vs `pull_request` difference — that was wrong.**
The push run on `main` fails with the byte-identical numbers the four PRs show, so the
trigger is irrelevant.

The real cause is non-deterministic coverage. CR-205's single-use-token tests
(`auth.routes.test.ts` — "lets exactly one of several concurrent requests use the same
token", and its password-reset twin) fire four real concurrent requests at one token.
A loser can be rejected on either of two paths:

- the pre-check `if (tokenRow.usedAt)` outside the transaction
  (`auth.service.ts:184` / `:424`), or
- the guarded UPDATE inside it (`auth.service.ts:211` / `:458`).

The tests only assert the outcome `[200, 400, 400, 400]`, which both paths satisfy. When
timing sends every loser down the pre-check, `auth.service.ts:212` never executes and
the auth scope drops below its floor. Reproduced locally: a coverage run of
`src/modules/auth/` left line 212 at count 0 while line 459 (the reset twin) happened to
be covered — the same coin-flip, landing differently per run.

## Fix

Two deterministic tests, one per guarded UPDATE, that claim the token in exactly the
window the guard exists for: a `Proxy` over `db` intercepts `.transaction`, marks the
token `usedAt`, then delegates — so the service enters its transaction holding a row
another request has already claimed. The pre-check cannot reject it, so only the
in-transaction branch can.

Both were mutation-tested: wrapping each guard in `if (false && …)` makes its test fail,
so neither is a test that passes regardless.

## Acceptance criteria

- `pnpm coverage:check` passes locally with the live stack, baseline unchanged. ✅
- The auth race branches are covered on every run, not by chance. ✅
- `pnpm typecheck`, `pnpm lint`, Prettier clean. ✅
- `ci` green on `main` after the push. ⏳
- CR-208 resumes once `main` is green.

## Validation (local, 2026-10-04)

Full stack up (`docker compose up -d postgres redis s3 s3-init`; native `postgresql@14`
stopped first — it held :5432 without a `postgres` role). Env from `.env` plus
`RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`.

- `pnpm test:coverage` — 606 passed, 3 skipped, all 6 tasks green.
- `pnpm coverage:check` — "Coverage holds at or above the baseline."
  `apps/api/src/modules/auth/` branches **81.82 (+1.18)**, statements +0.20, lines +0.11.
- `pnpm typecheck`, `pnpm lint`, `npx prettier --check` — clean.

Note on the first gate run: it reported `modules/rides/ branches 84.64 < 84.80`. That was
my own environment, not a defect — `S3_*` were not exported, so the live S3 tests skipped
and `route-storage.ts` fell to 62.5%. With `.env` sourced properly, rides is back at
84.80 (+0.00).

## Progress

- [x] reproduce the drop locally and identify the uncovered branch
- [x] deterministic test for verify-email's guarded UPDATE
- [x] deterministic test for reset-password's guarded UPDATE
- [x] mutation-test both
- [x] full local validation (coverage gate, typecheck, lint, format)
- [ ] push and confirm `ci` green on `main`
- [ ] investigate the e2e failure seen on PR #2 (see below)
- [ ] changelog + close-task, then resume CR-208

## Discovered issues

1. **e2e `login-return.spec.ts:67` failed on PR #2** (`pnpm/action-setup` bump,
   run 37190446630): `getByRole('heading', { name: 'Email подтверждён' })` not found,
   through all 2 CI retries. `main`'s own run never reached the e2e job — it died on the
   coverage gate first — so it is not yet known whether this is a `main` problem or
   specific to that PR. Must be checked once `main` is green.
2. The old concurrency tests are kept: they assert the end-to-end invariant (exactly one
   winner) that the deterministic pair does not. They are no longer load-bearing for
   coverage.

## Superseded — CR-208's Dependabot work (resumes after this)

Source: owner — "Dependabot - реши проблему с ботом", after CR-207's push showed four
red Dependabot runs. Branch `main`.

## Goal

Find why the bot itself fails, then clear the 13-PR backlog per the `dependabot-triage`
skill. Owner's decisions (2026-10-04): rebase the safe PRs and merge the green ones;
leave the majors open and record them as a KI rather than closing them with `ignore`.

## Diagnosis — CORRECTED: two separate causes, one of them ours

**First read (wrong, kept for the record):** the four runs of 2026-10-04 08:29Z looked
like pure proxy flakiness, because the only visible errors were `connection reset by
peer` bursts and the same updates had succeeded the day before.

**Real cause of the npm failures (reproducible, ours):** forcing a rebase surfaced the
actual error, which the first log had buried under the proxy noise:

```
ERR_PNPM_NO_MATURE_MATCHING_VERSION
Version 10.7.3 (released 2 days ago) of ip-address does not meet the
minimumReleaseAge constraint
This error happened while installing the dependencies of @fastify/rate-limit@11.2.0
```

`ip-address@10.7.3` was published 2026-10-01T22:35Z and entered `pnpm-lock.yaml` with
CR-205 (`0a1d9d6`, the `@fastify/rate-limit` security bump). Dependabot runs its
resolution with `--config.minimum-release-age=4320` (a 3-day quarantine against freshly
published malicious releases, injected by Dependabot — this repo has no `.npmrc`), so
every npm update fails until the quarantine expires **2026-10-05 ~10:35Z**. That is
why #8/#9/#23 stayed `CONFLICTING` on their old SHAs while the four GitHub-Actions PRs
rebased fine: Actions updates never resolve the npm tree.

Owner's decision (2026-10-04): wait the quarantine out, change nothing. `ip-address`
10.7.2 (2026-09-15) would satisfy `@fastify/rate-limit`'s own `^10.2.0` and carries no
advisory (the alert was fixed in 10.7.1), but pinning it back would be editing the
lockfile to suit a tool, and the next `pnpm install` would undo it.

**Older red PR checks have their own unrelated transient causes:** #1 failed 2026-09-27
on `Docker pull ... unauthorized`; #9's 2026-09-20 run predates the MinIO → SeaweedFS
switch (ADR-025).

## Second problem found: the coverage gate fails on every PR

After the rebase, `ci` went red on #1, #3, #18 **and** #26 with byte-identical numbers:

```
apps/api/src/modules/auth/ lines: 95.16% < baseline 95.59%
                     statements: 94.74% < baseline 95.06%
                       branches: 80.30% < baseline 80.64%
```

The same commit range passes on `main` (run 37189544852: auth 95.70/95.26/97.56/81.82).
Identical figures across four independent PRs rule out the PR contents. The floor
itself has not moved since CR-189..CR-194. So some auth code — most likely CR-205's
single-use-token race paths — is exercised in a `push` run but not in a
`pull_request` run. Not caused by Dependabot and not fixable inside a bump PR.

## Original diagnosis notes (bot was never misconfigured)

The four runs of 2026-10-04 08:29–08:30Z (`tailwind-merge`, `zod`, `lucide-react`,
`next`) all died the same way: `pnpm update <pkg> --lockfile-only --no-save -r
--config.minimum-release-age=4320` (the updater's own command, run inside its
container) exited 1 right after a burst of `connection reset by peer` /
`Cannot handshake client registry.npmjs.org:443` on Dependabot's mitm proxy.
Reported to the API as `unknown_error` with no details, which is why the PR pages
say nothing useful.

Evidence it is transient infrastructure, not this repository:

- the _same three_ updates (`lucide-react`, `next`, `tailwind-merge`) succeeded the
  previous day, 2026-10-03 09:04Z;
- reproducing the exact failing command locally — both on current `main` and in a
  worktree at `0a1d9d6` (before CR-206 touched any dependency) — exits 0;
- `minimum-release-age=4320` is injected by Dependabot (a 3-day quarantine against
  fresh malicious releases), not from any `.npmrc` here (the repo has none);
- the older red PR checks have their own unrelated transient causes: #1 failed
  2026-09-27 on `Docker pull ... unauthorized`, #9 on 2026-09-20 against the
  since-replaced MinIO service (now SeaweedFS, ADR-025).

So the fix is a rebase, which both recreates the update and re-runs CI against a
`main` that now carries CR-207's Toast fix.

## Classification (13 open PRs)

Safe — rebase, merge when green:

- #8 `tailwind-merge` 3.6.0 → 3.7.0 (still a direct dep of `packages/ui`; CR-206 only
  dropped `apps/web`'s redundant copy, so this PR is still wanted)
- #23 `lucide-react` 1.45.0 → 1.49.0
- #9 `zod` 4.6.2 → 4.6.5
- #26 `chrislusf/seaweedfs` 4.47 → 4.48 (ADR-025; verify with `pnpm smoke:docker`)
- #1 `actions/checkout` 4 → 7, #3 `actions/setup-node` 4 → 7,
  #2 `pnpm/action-setup` 4 → 6, #18 `actions/upload-artifact` 4 → 7

Declined majors — left open, recorded as **KI-091**:

- #19/#20/#21 `node:24-alpine` → `26-alpine` (project pins LTS 24 — CR-067)
- #15 `postgres:17-alpine` → `18-alpine` (needs a volume upgrade path)
- #22 `next` 15.5.25 → 16.3.7 — already **KI-090**, its own planned CR

## Release-note review for the Actions majors

- `actions/checkout` v7: ESM; blocks fork-PR checkout for `pull_request_target`/
  `workflow_run` (new `allow-unsafe-pr-checkout`). This repo checks out only the
  default ref in `push`/`pull_request`/`schedule`/`workflow_dispatch` jobs — not
  affected.
- `actions/setup-node` v5 added automatic caching from `packageManager`, v6 narrowed
  it to npm only, v7 is ESM + drops the dummy `NODE_AUTH_TOKEN`. Every workflow here
  already passes `cache: pnpm` explicitly alongside `node-version-file: .nvmrc`, so
  the auto-cache change is moot; nothing reads `NODE_AUTH_TOKEN`.
- `actions/upload-artifact` v7 is ESM and adds unzipped single-file upload; the
  existing `name:` + path usage is unchanged.
- Actions run in 4 workflows (`ci`, `load-test`, `maps-contract`, plus the compose
  smoke job), so green CI on the bump PR is the real check, not the notes alone.

## Acceptance criteria

- The root cause is established and recorded (not "Dependabot is flaky" hand-waving).
- Every safe PR rebased; each merged only on green `ci` + `docker-smoke`.
- Majors left open with KI-091 explaining why, and KI-090 still pointing at Next 16.
- Changelog/tasks/project-state updated; nothing merged without the owner's go-ahead
  (given).

## Progress

- [x] root cause from the updater log (proxy resets, reproduced-clean locally)
- [x] classified all 13 PRs; read the Actions majors' release notes
- [x] KI-091 written for the declined Node/Postgres majors
- [x] `@dependabot rebase` on all 8 safe PRs
- [ ] merge the green ones one at a time, letting CI run between lockfile-touching PRs
- [ ] `pnpm smoke:docker` before #26
- [ ] changelog + close-task

## Discovered issues

1. The three npm PRs (#8/#9/#23) showed `CONFLICTING` before their rebase landed —
   expected: CR-206 and CR-207 both rewrote `pnpm-lock.yaml` under them.
2. 13 stale remote `dependabot/*` branches exist, one per open PR — noise, not a
   problem; they go away with the PRs.
