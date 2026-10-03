# Coffee Ride — Claude Code Harness v3

## Language

Always reply to the user in Russian — answers, summaries, the end-of-run report
sections, handoffs, questions and error explanations included. Code, identifiers,
commit messages and repository docs stay in English.

## Visual baselines

Regenerate `toHaveScreenshot` baselines with Docker, as x86_64
(`--platform linux/amd64`, the command in `.claude/rules/testing.md` → "Visual
regression"). The amd64 image pull has stalled on this network before, so run the pull
in the background and stop it after ~10 minutes without progress — do not retry it in a
loop. Fallback: push, let the `ci` job fail on the screenshots, `gh run download <run>
-n playwright-report`, check each `*-diff.png` shows only the intended change or
anti-aliasing, then commit the matching `*-actual.png` files. If baselines are still
pending at the end of a run, say so under "Found".

## Mission

Coffee Ride is a Russian platform for discovering, organizing, and participating in group cycling rides.

Core loop:
Organizer: create → configure → route → stops/services → publish → registrations → updates → finish
Participant: discover → inspect → register → receive updates → participate → review

## Non-negotiable operating rule

The repository is the persistent source of truth.

Do not rely on chat history as the only project context. Before every non-trivial task, inspect:

1. `.claude/CLAUDE.md`
2. `.claude/context/project-state.md`
3. `.claude/context/architecture-map.md`
4. `.claude/context/current-task.md` if present
5. `docs/changelog.md` (last 5-10 entries) for recent history and rationale
6. relevant files under `docs/`
7. current source code
8. `git status` and relevant recent commits

## Fixed stack

- Monorepo: pnpm workspaces + Turborepo
- Web: Next.js 15 + React + TypeScript
- UI: Tailwind CSS + shadcn/ui
- API: Node.js + Fastify + TypeScript
- API: REST + OpenAPI
- Validation: Zod
- DB: PostgreSQL
- ORM: Drizzle
- Cache/rate limiting/jobs: Redis, only where justified
- Files: S3-compatible object storage
- Maps: 2GIS
- Auth: Auth.js-compatible session architecture
- Tests: Vitest + Playwright
- Quality: ESLint + Prettier
- Git hooks: Husky + lint-staged
- CI: GitHub Actions
- Local infra: Docker Compose

Do not replace the stack without an explicit architectural decision.

## Brand color

"Фирменный цвет" (the brand color) is `#82668C` — locked in by the project owner
2026-09-24 (ADR-024, «Ночной старт», superseding CR-124's `#9033A1`), matching the
"Ночной старт" v2 mockup. Unlike CR-124's single-role lock, ADR-024 splits the color
into three roles in `packages/ui/src/tokens.css`: light-theme `--primary` (AA text/
links/focus/active-tab, `#74597E` — a shade darker than the brand hex so body text
clears AA on white) is now distinct from `--brand` (logo, route track, graphic
elements — the actual `#82668C`, also `--route`/`--map-route`/`--map-marker-selected`)
and `--primary-fill` (button fill, `#82668C` in both themes). The dark theme's
`--primary` is `#B8A0C1` (documented in `docs/design.md` §3) for contrast on a
near-black background — not the same hex, same role. Do not introduce a new purple
hex anywhere without updating `packages/ui/src/tokens.css` and `docs/design.md` §3
together; never hard-code this (or any) color literal in `apps/web`/`apps/api` source
(`.claude/rules/frontend.md`).

## Domain entities

User, OrganizerProfile, Ride, Route, RoutePoint, Stop, RideGroup (ADR-022), RideRequirement, RideService, Registration, WaitlistEntry, RideUpdate, Notification, Review, Bike (ADR-023).

Do not create duplicate concepts under different names.

## Mandatory development loop

For non-trivial work:

1. Read context.
2. Inspect repository.
3. Create/update `.claude/context/current-task.md`.
4. Plan.
5. Wait for explicit approval if using `/plan`.
6. Implement the approved scope.
7. Run validation.
8. Review the implementation.
9. If errors/findings exist, fix root causes.
10. Re-run the failed and affected checks.
11. Repeat until clean or a real blocker is reached.
12. Update persistent project context.
13. Update `docs/tasks.md`.
14. Review `git diff`.
15. Commit only when requested/appropriate.

## Autonomous execution and handoff

Once the task scope is approved, continue without asking for confirmation between routine steps.

Do not pause only to:

- summarize a next step without taking it;
- ask whether to continue when the answer does not affect the implementation;
- present options that do not block progress.

Ask for my input only when a stop condition applies, the approved scope must change, or a decision materially affects product behavior, architecture, security, cost, or external contracts.

Keep progress in `.claude/context/current-task.md`.
Do not create a separate `TASKS.md`: `current-task.md` is the active task record, and `docs/tasks.md` is the persistent task list.

At the end of every non-trivial run, respond with exactly these sections:

## Needs my input

Only blockers, decisions, approvals, access, or clarification required from me. Write `None` if there is nothing.

## Changed

Implemented behavior, changed files, migrations, API or configuration changes, and validation performed.

## Found

Risks, defects, technical debt, assumptions, and anything that could not be confirmed. Include the relevant evidence or location.

## Skill routing

Pick skills from this table — do not list or open every `SKILL.md` to decide. Load
(Skill tool) only the skill whose trigger matches, and read only that one file. A row
marked "global" is a user-level/plugin skill, not in `.claude/skills/`. Skills are
procedures, not replacements for the rules files they link to.

### By development-loop step

| Loop step     | Skill                                     | Call it when                                                                                                            |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1–4 Read/plan | `qa-report-intake`                        | the owner hands over a QA/UX report or list of P1/P2/P3 defects                                                         |
| 1–4 Read/plan | `adr`                                     | a real architectural choice is being made or reconsidered                                                               |
| 1–4 Read/plan | `grilling` (global)                       | the owner asks to stress-test a plan/idea ("пограйли")                                                                  |
| 6 Implement   | `new-api-endpoint`                        | adding/changing a REST endpoint in `apps/api`                                                                           |
| 6 Implement   | `db-migration`                            | any change under `packages/db` schema/migrations                                                                        |
| 6 Implement   | `new-cabinet-feature`                     | a new organizer/participant cabinet feature, widget or nav item                                                         |
| 6 Implement   | `mockup-to-screen`                        | bringing a page in line with an approved mockup                                                                         |
| 6 Implement   | `map-provider-change`                     | adding/swapping a map/geocoding provider                                                                                |
| 6 Implement   | `terminology-string`                      | adding/changing any user-visible Russian string                                                                         |
| 6 Implement   | `engineering:debug` (global)              | a bug whose cause isn't obvious after one read of the code                                                              |
| 7 Validate    | `storybook-check`                         | after any `apps/web`/`packages/ui` component change — always, before "done"                                             |
| 7 Validate    | `run-dev` → `browser-automation` (global) | a change must be seen working in the real app                                                                           |
| 7 Validate    | `visual-baselines`                        | a screenshotted screen changed, or CI fails on `*-linux.png`                                                            |
| 8 Review      | `simplify` (global)                       | after implementing, on the task's diff (quality pass, applies fixes)                                                    |
| 8 Review      | `code-review` (global)                    | correctness review of the diff before commit; `security-review` too if auth/authz/uploads/participant data were touched |
| 8 Review      | `security-review`                         | touched `/auth`, sessions, ownership checks, uploads or participant data                                                |
| 12–14 Close   | `close-task`                              | every non-trivial task, after validation (context, changelog, tasks, report)                                            |
| 12–14 Close   | `known-issue`                             | a blocker/limitation must outlive the session, or a KI is resolved                                                      |
| 15 Commit     | `commit-push`                             | the owner asks to commit/push                                                                                           |

### Outside a task

| Situation                                                 | Skill                                            |
| --------------------------------------------------------- | ------------------------------------------------ |
| CI red / "почему упал CI" / after a push whose run failed | `ci-triage`                                      |
| Dependabot PRs pile up, dependency security alert         | `dependabot-triage`                              |
| Waiting for a CI run or deploy                            | `loop` (global), or Monitor on `gh run watch`    |
| "Запусти проект"                                          | `run-dev`                                        |
| Pre-release / production deploy (KI-045)                  | `engineering:deploy-checklist` (global)          |
| Tech-debt audit, "что рефакторить"                        | `engineering:tech-debt` (global)                 |
| Test strategy for a new area                              | `engineering:testing-strategy` (global)          |
| Frequent permission prompts                               | `fewer-permission-prompts` (global)              |
| UI design critique/polish beyond a mockup                 | `impeccable` (global)                            |
| New/changed project skill                                 | `skill-creator` (global), then update this table |

### Usual chains

- Frontend feature: `new-cabinet-feature` → `terminology-string` → `storybook-check`
  → (`visual-baselines` if a screenshotted screen moved) → `simplify` → `close-task`.
- API feature: `db-migration` → `new-api-endpoint` → `security-review` → `close-task`.
- QA report: `qa-report-intake` → per CR the chains above → `close-task` → `commit-push`
  → `ci-triage` if red.

`mockup-to-screen/shots.mjs` screenshots key pages at 320/390/1440.

## Self-correction protocol

Claude MUST verify its own work.

After implementation, run the narrowest relevant:

- tests;
- typecheck;
- lint;
- build when relevant.

Then inspect:

- test output;
- type errors;
- lint errors;
- build/runtime errors;
- git diff;
- acceptance criteria.

If an error is found:

1. Diagnose the root cause.
2. Fix the root cause, not merely the symptom.
3. Re-run the failed check.
4. Re-run related tests/checks.
5. Repeat.

Never:

- ignore a failing check;
- disable or weaken a test just to pass;
- remove functionality to hide an error;
- suppress type errors without a justified reason;
- claim a check passed when it was not run.

### Stop conditions

Stop and report a blocker when:

- the failure depends on an unavailable external service/credential;
- requirements conflict and cannot be resolved from repository docs;
- fixing one issue would require an unapproved architectural/product change;
- repeated attempts do not produce a stable fix.

Before stopping, preserve the current state and document the blocker in `.claude/context/known-issues.md`.

## Context preservation protocol

After every non-trivial completed task, update:

- `.claude/context/project-state.md` (overwrite — it is a snapshot of current state)
- `docs/changelog.md` (append a new entry — never edit/delete past entries)
- `.claude/context/architecture-map.md` when structure changed
- `docs/decisions.md` when an architectural decision was made (append new ADR)
- `docs/tasks.md` (check off the completed task)
- `.claude/context/known-issues.md` if issues were discovered or resolved

Record:

- what changed;
- why;
- important decisions;
- database migrations;
- API changes;
- new dependencies;
- known limitations;
- next logical task.

`project-state.md` answers "where are we now." `docs/changelog.md` answers "how did we get
here, in order." Both matter: do not skip the changelog entry just because project-state.md
was updated, and do not treat the changelog as a substitute for keeping project-state.md
current.

Do not rewrite historical decisions. Append new decisions. Never edit past changelog entries
— if something recorded turns out to be wrong, add a new entry correcting it.

If `docs/changelog.md` grows large, follow its own archiving section (`docs/changelog.md`
→ "Archiving") to move old entries into `docs/changelog-archive/`. Only the most recent
entries need to be read for routine work.

When a `.claude/context/known-issues.md` issue is resolved, move its entry immediately
into `.claude/context/known-issues-archive.md` per that file's own Archiving section —
don't let a "Resolved" section accumulate in the live file.

## Task state

`.claude/context/current-task.md` is temporary working memory for the active task.

It must contain:

- task ID;
- goal;
- requirements;
- acceptance criteria;
- planned files;
- implementation progress;
- validation results;
- discovered issues;
- final result.

Do not delete useful information before transferring it to persistent project state.

## Architecture

- `apps/web` never accesses PostgreSQL directly.
- `apps/api` owns business rules and authorization.
- `packages/db` owns schema/migrations/client.
- `packages/types` owns shared types/contracts.
- `packages/ui` owns reusable UI.
- `packages/maps-core` owns the provider-neutral map interface; `packages/maps-2gis` is
  the only package that imports the 2GIS SDK (ADR-010, `.claude/rules/maps.md`).
- 2GIS-specific code stays behind the `packages/maps-2gis` adapter — never imported
  directly by `apps/web`, `apps/api`, or any other package.
- Organizer/participant cabinet features follow the feature-module structure in
  `.claude/rules/extensibility.md` (ADR-009) — read it before adding a new cabinet
  feature or touching `packages/ui`/shared API contracts.
- Auth/authorization follow `.claude/rules/security.md` (ADR-006) — read it before
  touching anything under `/auth`, session handling, or ownership checks.

The architecture is a modular monolith, not microservices (see `docs/decisions.md` →
ADR-008). Failure isolation between areas of the app is achieved through the patterns in
`.claude/rules/resilience.md` (timeouts, retries, circuit breakers, async side effects,
module boundaries) — read that file before implementing anything that calls an external
service (2GIS, S3, notifications) or that touches the registration/capacity
invariants.

Backend preference:
`route/controller → validation → use case/service → repository/db`

Keep HTTP handlers thin.

## Security

Server-side validation and authorization are mandatory.

Never expose:

- secrets;
- tokens;
- passwords;
- private participant data.

Never trust organizer/user IDs supplied by the client.

Protect participant contact and emergency information.

## Database

PostgreSQL + Drizzle.
Every schema change requires a migration.
Important invariants should be enforced at the database level where practical.

Registration must atomically protect:

- registration availability;
- participant capacity;
- duplicate registration.

## Quality gate

A task is complete only if:

- requested behavior is implemented;
- acceptance criteria are satisfied;
- relevant tests pass;
- typecheck passes;
- lint passes;
- build passes when relevant;
- no unrelated changes exist;
- documentation/context is updated;
- git diff has been reviewed.

Never say "done" while known CRITICAL/HIGH issues remain.
