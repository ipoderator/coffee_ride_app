# Coffee Ride — Claude Code Harness v3

## Language

Always reply to the user in Russian — answers, summaries, the end-of-run report
sections, handoffs, questions and error explanations included. Code, identifiers,
commit messages and repository docs stay in English.

## Mission

Coffee Ride is a Russian platform for discovering, organizing, and participating in
group cycling rides.

- Organizer: create → configure → route → stops/services → publish → registrations →
  updates → finish
- Participant: discover → inspect → register → receive updates → participate → review

## Non-negotiable operating rule

The repository is the persistent source of truth — never chat history alone. Before
every non-trivial task, read **targeted slices**, not whole files (see "Token economy"):

1. `.claude/context/current-task.md` if present (whole — it is short).
2. `.claude/context/project-state.md` — "Current task", "In progress", "Next":
   `sed -n '/^## Current task/,/^## Implemented/p;/^## In progress/,/^## Important decisions/p' .claude/context/project-state.md`
3. `docs/changelog.md` — the last 3 entries:
   `awk '/^## 20/{i++} i{a[i]=a[i] $0 "\n"} END{for(k=i-2;k<=i;k++) printf "%s", a[k]}' docs/changelog.md`
4. `.claude/context/architecture-map.md` — the section for the area being changed
   (compact; whole is fine when the task spans areas).
5. `.claude/context/known-issues.md` — headers only (`grep -n '^### KI-'`), then the
   entries relevant to the task.
6. `.claude/rules/do-not-break.md` — loads automatically (whole) once a code/infra file
   is opened; while planning, read it explicitly.
7. History of the area being changed: grep the touched files/module/feature in
   `docs/changelog.md` and `docs/changelog-archive/` (e.g.
   `grep -n "route-storage\|RouteUploadForm" docs/changelog.md docs/changelog-archive/*.md | cut -c1-160`)
   and read the matching entries (`sed -n` on their line ranges) — the last 3 entries don't cover older decisions.
8. Relevant `docs/*` sections (grep the heading, read that section), current source
   code, `git status` and relevant recent commits.

Archives (`docs/changelog-archive/`, `docs/tasks-archive.md`,
`.claude/context/*-archive.md`) are for grep (by id, file or module) — never read
whole.

## Fixed stack

pnpm workspaces + Turborepo; Next.js 15 + React + TypeScript; Tailwind CSS + shadcn/ui;
Node.js + Fastify + TypeScript, REST + OpenAPI; Zod; PostgreSQL + Drizzle; Redis (cache/
rate limiting/jobs, only where justified); S3-compatible object storage; 2GIS maps;
Auth.js-compatible sessions; Vitest + Playwright; ESLint + Prettier; Husky + lint-staged;
GitHub Actions; Docker Compose for local infra. Do not replace the stack without an
explicit architectural decision.

## Domain entities

User, OrganizerProfile, Ride, Route, RoutePoint, Stop, RideGroup (ADR-022),
RideRequirement, RideService, Registration, WaitlistEntry, RideUpdate, Notification,
Review, Bike (ADR-023). Do not create duplicate concepts under different names.

## Mandatory development loop

For non-trivial work:

1. Read context (targeted, above).
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

Once the task scope is approved, continue without asking for confirmation between
routine steps. Do not pause only to summarize a next step without taking it, to ask
whether to continue when the answer does not affect the implementation, or to present
options that do not block progress. Ask for my input only when a stop condition
applies, the approved scope must change, or a decision materially affects product
behavior, architecture, security, cost, or external contracts.

Keep progress in `.claude/context/current-task.md`. Do not create a separate
`TASKS.md`: `current-task.md` is the active task record, `docs/tasks.md` the persistent
task list.

At the end of every non-trivial run, respond with exactly these sections:

- `## Needs my input` — only blockers, decisions, approvals, access, or clarification
  required from me; `None` if there is nothing.
- `## Changed` — implemented behavior, changed files, migrations, API or configuration
  changes, and validation performed.
- `## Found` — risks, defects, technical debt, assumptions, and anything that could not
  be confirmed, with evidence or location (including pending visual baselines).

## Skill routing

Pick skills from this list — do not list or open every `SKILL.md` to decide. Load only
the skill whose trigger matches and read only that file. "(global)" = user-level/plugin
skill, not in `.claude/skills/`. Skills are procedures, not replacements for the rules
files they link to.

By loop step:

- Read/plan: `qa-report-intake` — owner hands over a QA/UX report or P1/P2/P3 list;
  `adr` — a real architectural choice; `grilling` (global) — stress-test a plan.
- Implement: `new-api-endpoint` — REST endpoint in `apps/api`; `db-migration` — any
  `packages/db` schema change; `new-cabinet-feature` — cabinet feature/widget/nav item;
  `mockup-to-screen` — page to an approved mockup (`shots.mjs` screenshots 320/390/1440);
  `map-provider-change` — map/geocoding provider; `terminology-string` — any
  user-visible Russian string; `engineering:debug` (global) — cause not obvious after
  one read.
- Validate: `storybook-check` — after any `apps/web`/`packages/ui` component change,
  always; `run-dev` → `browser-automation` (global) — see it work in the real app;
  `visual-baselines` — a screenshotted screen changed or CI fails on `*-linux.png`.
- Review: `simplify` (global) — quality pass on the diff; `code-review` (global) —
  correctness before commit; `security-review` — touched auth, sessions, ownership,
  uploads or participant data.
- Close: `close-task` — every non-trivial task after validation; `known-issue` — a
  blocker/limitation must outlive the session, or a KI is resolved.
- Commit: `commit-push` — the owner asks to commit/push.

Outside a task: `ci-triage` — CI red; `dependabot-triage` — Dependabot PRs/alerts;
`loop` (global) or Monitor on `gh run watch` — waiting for CI/deploy;
`engineering:deploy-checklist` (global) — release/deploy (KI-045);
`engineering:tech-debt` / `engineering:testing-strategy` (global) — audits and test
plans; `fewer-permission-prompts` (global); `impeccable` (global) — UI polish beyond a
mockup; `skill-creator` (global) — new/changed skill, then update this list.

Chains: frontend feature `new-cabinet-feature` → `terminology-string` →
`storybook-check` → (`visual-baselines`) → `simplify` → `close-task`. API feature
`db-migration` → `new-api-endpoint` → `security-review` → `close-task`. QA report
`qa-report-intake` → per-CR chains → `close-task` → `commit-push` → `ci-triage` if red.

## Token economy

Every agent pays for what it reads; the context files are shared by every session.

- Read slices (`sed -n '/^## X/,/^## /p'`, `grep -n`, `tail`), not whole large files;
  never read an archive whole. Don't re-read a file already in context.
- Command output: pipe test/build/CI logs through `tail`/`grep` (e.g.
  `vitest run --reporter=dot … | tail -30`, `turbo … --output-logs=errors-only`,
  `gh run view --log-failed | tail -200`); run the narrowest suite first.
- Keep the context files small, they are snapshots: `project-state.md` ≤ ~150 lines,
  `architecture-map.md` one line per module, `tasks.md` open work + ~8 recent, changelog
  entries ≤ ~600-character summaries with archiving at ~15 entries.
- Rules in `.claude/rules/` with `paths:` frontmatter load only when a matching file is
  read/edited. If a task concerns an area before touching its files (planning an auth
  change, an external call), read the rule explicitly: `security.md`, `resilience.md`,
  `extensibility.md`, `maps.md`, `testing.md`, `database.md`, `backend.md`,
  `frontend.md`, `do-not-break.md`. `architecture.md` and `git.md` always load.
- Don't spawn subagents unless asked; prefer one targeted search over broad sweeps.

## Self-correction protocol

Claude MUST verify its own work. After implementation, run the narrowest relevant tests,
typecheck, lint, and build when relevant. Then inspect test output, type errors, lint
errors, build/runtime errors, git diff and acceptance criteria. If an error is found:
diagnose the root cause, fix the root cause (not merely the symptom), re-run the failed
check, re-run related checks, repeat.

Never: ignore a failing check; disable or weaken a test just to pass; remove
functionality to hide an error; suppress type errors without a justified reason; claim a
check passed when it was not run.

### Stop conditions

Stop and report a blocker when the failure depends on an unavailable external service/
credential; requirements conflict and cannot be resolved from repository docs; fixing
one issue would require an unapproved architectural/product change; or repeated
attempts do not produce a stable fix. Before stopping, preserve the current state and
document the blocker in `.claude/context/known-issues.md` (`known-issue` skill).

## Context preservation protocol

After every non-trivial completed task (`close-task` skill), update:

- `.claude/context/project-state.md` (overwrite — a snapshot of current state);
- `docs/changelog.md` (append a new entry — never edit/delete past entries);
- `.claude/context/architecture-map.md` when structure changed;
- `docs/decisions.md` when an architectural decision was made (append new ADR);
- `docs/tasks.md` (check off the completed task);
- `.claude/context/known-issues.md` if issues were discovered or resolved.

Record what changed, why, important decisions, database migrations, API changes, new
dependencies, known limitations and the next logical task. `project-state.md` answers
"where are we now"; `docs/changelog.md` answers "how did we get here, in order" — keep
both, neither substitutes for the other.

Do not rewrite historical decisions; append new ones. Never edit past changelog entries
— if something recorded is wrong, add a new entry correcting it. Archive per each file's
own "Archiving" section (changelog → `docs/changelog-archive/`, done tasks →
`docs/tasks-archive.md`). A resolved KI moves immediately into
`.claude/context/known-issues-archive.md` — no "Resolved" section in the live file.

## Task state

`.claude/context/current-task.md` is temporary working memory for the active task. It
must contain: task ID; goal; requirements; acceptance criteria; planned files;
implementation progress; validation results; discovered issues; final result. Do not
delete useful information before transferring it to persistent project state.

## Architecture

- `apps/web` never accesses PostgreSQL directly; `apps/api` owns business rules and
  authorization; `packages/db` owns schema/migrations/client; `packages/types` owns
  shared types/contracts; `packages/ui` owns reusable UI.
- `packages/maps-core` owns the provider-neutral map interface; `packages/maps-2gis` is
  the only package that imports the 2GIS SDK — never imported directly by `apps/web`,
  `apps/api`, or any other package except their one composition point (ADR-010,
  `.claude/rules/maps.md`).
- Cabinet features follow `.claude/rules/extensibility.md` (ADR-009) — read it before
  adding a cabinet feature or touching `packages/ui`/shared API contracts.
- Auth/authorization follow `.claude/rules/security.md` (ADR-006) — read it before
  touching `/auth`, session handling, or ownership checks.
- Modular monolith, not microservices (ADR-008). Failure isolation comes from
  `.claude/rules/resilience.md` (timeouts, retries, circuit breakers, async side
  effects, module boundaries) — read it before anything that calls an external service
  (2GIS, S3, notifications) or touches the registration/capacity invariants.
- Backend: `route/controller → validation → use case/service → repository/db`; keep
  HTTP handlers thin.

## Security

Server-side validation and authorization are mandatory. Never expose secrets, tokens,
passwords or private participant data. Never trust organizer/user IDs supplied by the
client. Protect participant contact and emergency information.

## Database

PostgreSQL + Drizzle. Every schema change requires a migration. Enforce important
invariants at the database level where practical. Registration must atomically protect
registration availability, participant capacity and duplicate registration.

## Quality gate

A task is complete only if: requested behavior is implemented; acceptance criteria are
satisfied; relevant tests, typecheck and lint pass; build passes when relevant; no
unrelated changes exist; documentation/context is updated; git diff has been reviewed.
Never say "done" while known CRITICAL/HIGH issues remain.
