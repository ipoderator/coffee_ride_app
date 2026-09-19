# Current task

## Task ID

CR-082 — Pin `minio/minio` to a release tag; review base image versions
(`docs/tasks.md` Deployment section).

## Goal

Close the last open Deployment-section ticket.

## Investigation

- MinIO pinning is already done: `docker-compose.yml` and `.github/
workflows/ci.yml` both already use `quay.io/minio/minio:RELEASE.
2025-09-07T16-13-09Z` (not `:latest`), landed back in CR-009
  (2026-09-13, `docs/changelog.md`). Grepped the whole repo for
  `minio/minio`/`:latest` — nothing unpinned anywhere. Same "ticket text
  already stale" shape as CR-080's migration-step third.
- "Review base image versions" — every Dockerfile uses `node:24-alpine`
  (`apps/web/Dockerfile`, `apps/api/Dockerfile`, `packages/db/Dockerfile`);
  `docker-compose.yml` also has `postgres:17-alpine`, `redis:8-alpine`;
  `docker-compose.prod.yml` has `caddy:2-alpine`. All are major/minor
  floating tags, not `:latest` and not digest-pinned.
- Checked how those floating tags actually get reviewed over time:
  `.github/dependabot.yml` has one `package-ecosystem: 'docker'` entry,
  `directory: '/'`. Verified against GitHub's own docs (WebFetch) and a
  web search (WebSearch) that this is broken in two real ways, not just
  theoretically:
  1. `docker` and `docker-compose` are two _separate_ Dependabot
     ecosystems (`docker-compose` reached GA Feb 2025) — a `docker` entry
     never scans `image:` references inside `docker-compose.yml`/
     `docker-compose.prod.yml` at all. No `docker-compose` ecosystem entry
     exists in this repo's config, so those two files' `postgres`/`redis`/
     `minio`/`caddy` image pins have never been covered by any Dependabot
     update.
  2. The `docker` ecosystem only scans the exact `directory` given, no
     subdirectory recursion — and this repo has no Dockerfile at the repo
     root at all (all three live nested: `apps/web`, `apps/api`,
     `packages/db`). The existing `directory: '/'` entry points at a
     location with no Dockerfile, so it has never actually scanned any of
     the three real Dockerfiles either.
     Net effect: nothing that sets a base-image version anywhere in this repo
     has ever actually been covered by Dependabot, despite `dependabot.yml`
     appearing to include a `docker` entry. This is the real, previously
     undiscovered gap behind "review base image versions" — not a one-time
     manual version bump (which would go stale again immediately), but fixing
     the mechanism that's supposed to do that review continuously.

## Decision

- `.github/dependabot.yml`: replace the one non-functional `docker` entry
  with three `docker` entries, one per actual Dockerfile directory
  (`/apps/web`, `/apps/api`, `/packages/db`), plus a new `docker-compose`
  entry (`directory: '/'`) covering `docker-compose.yml`/`docker-compose.
prod.yml`. Same weekly schedule as the existing ecosystems.
- No image version changes: `node:24-alpine`/`postgres:17-alpine`/
  `redis:8-alpine`/`caddy:2-alpine` stay as intentional major/minor
  floating tags (not `:latest`, not digest-pinned) — Dependabot, now
  actually wired to reach every one of them, is the ongoing review
  mechanism, not a manual audit that goes stale the moment it's done.
  MinIO is the one deliberate exception (an exact `RELEASE.*` tag, not a
  floating major version) because MinIO doesn't publish a rolling
  major-version tag the same way the others do.
- No new ADR — an implementation/tooling fix, same "not an architectural
  decision" precedent as CR-076/077/078/079/080/081.
- `docs/tasks.md`: check off CR-082.

## Requirements / acceptance criteria

- Every base image reference in the repo (3 Dockerfiles + 2 compose files)
  is reachable by some Dependabot entry.
- `dependabot.yml` stays valid YAML.
- No unrelated changes; `docs/tasks.md`/changelog/project-state updated.

## Planned files

- `.github/dependabot.yml`
- `docs/tasks.md`
- `docs/changelog.md`, `.claude/context/project-state.md`

## Implementation progress

- [x] `dependabot.yml` fix (3 `docker` entries + 1 `docker-compose` entry)
- [x] YAML validity check
- [x] Docs/context updated, `git diff` reviewed

## Validation results

- `.github/dependabot.yml` parsed with `python3 -c "import yaml..."`: valid
  YAML, all 6 entries present with the expected ecosystem/directory pairs
  (`npm /`, `github-actions /`, `docker /apps/web`, `docker /apps/api`,
  `docker /packages/db`, `docker-compose /`).
- Cannot be proven by an actual Dependabot run from this sandbox — same
  "GitHub-hosted automation, reviewed not live-verified" category as CI
  changes in CR-080. The next scheduled Dependabot run against the real
  repo is what actually confirms it.

## Discovered issues

Documented above under Investigation — the two real Dependabot config gaps
(missing `docker-compose` ecosystem, `docker` entry pointing at a
Dockerfile-less directory) are this ticket's actual substance, found while
scoping "review base image versions."

## Final result

CR-082 closed — Deployment section (`docs/tasks.md`) is now fully complete,
CR-074 through CR-082. MinIO pinning confirmed already done (CR-009). Fixed
the real gap: `.github/dependabot.yml` now has a `docker` entry per actual
Dockerfile directory and a `docker-compose` entry for both compose files —
previously nothing that sets a base image version anywhere in the repo was
actually reachable by any Dependabot scan. Base image tags themselves
unchanged by design (Dependabot is now the ongoing review mechanism).
`docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`
all updated. Next logical task: CR-092 (critical-journey e2e specs) or
CR-083 (registration idempotency) — no fixed order decided yet.
