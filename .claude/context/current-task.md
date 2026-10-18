# Current task — CR-271 — Keep VseCheki in the versioned Caddy configuration

Source: owner, 2026-10-18. The production Caddy is owned by Coffee Ride and is the only
listener on ports 80/443. A block for `всечеки.site` (`xn--b1agamj3b4b.site`) was added
only to the server checkout; the next Coffee Ride deploy could erase it or fail on the
dirty tree. Branch `feat/cr-271-vsecheki-caddy`.

## Requirements

- preserve the exact production VseCheki proxy and `www.` redirect in
  `deploy/Caddyfile`;
- record the shared-proxy/network contract and rollback in the repository;
- deliver through a PR with required CI, then deploy from `main`;
- remove the temporary server backup only after the repository version is live;
- finish with both sites healthy and the production checkout clean.

## Acceptance criteria

- `deploy/Caddyfile` contains the production block for `xn--b1agamj3b4b.site` and
  `www.xn--b1agamj3b4b.site`;
- Caddy validates the configuration;
- CR-271 / ADR-043 and the production runbook document ownership, Docker-network
  coupling, recovery after network recreation and rollback;
- PR checks `ci` and `docker-smoke` pass and the PR is squash-merged into `main`;
- production runs the merged revision, `coffeeride.site` and the VseCheki bare/`www.`
  hosts return the expected responses, and `git status` is clean.

## Planned files

- `deploy/Caddyfile`
- `docs/deployment.md`
- `docs/decisions.md`
- `.claude/rules/do-not-break.md`
- `.claude/context/{current-task,project-state,architecture-map}.md`
- `docs/{changelog,tasks}.md`

## Implementation progress

- Task branch created from current `origin/main`.
- The exact server block is present in `deploy/Caddyfile`.
- ADR/runbook/invariant/architecture documentation updated.

## Validation

- exact Caddy block equals the production handoff — passed;
- `caddy validate` against the repository file — passed;
- production Compose config render — passed;
- Prettier on touched Markdown and `git diff --check` — passed;
- live pre-deploy smoke: VseCheki bare host `200`, `www.` `301` to bare, Coffee Ride
  `200`, `vsecheki-web` attached to `coffee-ride_default`.

## Discovered issues

None.

## Final result

Implemented and locally validated; this commit is ready for the required PR/CI/merge.
Production already runs the equivalent server-only block; deployment from merged `main`,
backup removal and final clean-tree/live checks remain.
