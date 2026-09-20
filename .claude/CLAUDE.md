# Coffee Ride — Claude Code Harness v3

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

## Domain entities

User, OrganizerProfile, Ride, Route, RoutePoint, Stop, RideRequirement, RideService, Registration, WaitlistEntry, RideUpdate, Notification, Review.

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

## Project skills

`.claude/skills/` holds project-specific skills that encode the recurring workflows below
as step-by-step procedures (triggered automatically by task description, same mechanism
as any other Claude skill — no need to invoke them by name):

- `new-cabinet-feature` — adding a feature to the organizer/participant dashboard (ADR-009).
- `new-api-endpoint` — adding/changing a REST endpoint (layering, authz, validation).
- `db-migration` — schema changes with invariant-protecting constraints.
- `map-provider-change` — adding/swapping a map provider behind the adapter (ADR-010).
- `security-review` — systematic walkthrough of `.claude/rules/security.md`.
- `adr` — recording an architectural decision the way this project already does it.

These are procedures, not replacements for the underlying rules files — read the linked
rules file in full for anything the skill doesn't cover.

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
