# Coffee Ride — Claude Code Harness

Production-oriented Claude Code harness for the Coffee Ride project (Russian-market
platform for organized cycling rides). This repository is the harness/specification
layer — it does not pretend the application itself is already implemented. No
`apps/*`/`packages/*` code exists yet; the first implementation task is `CR-001`.

## What's in here

- `docs/` — product spec, architecture, API contract, database model, auth, maps,
  architecture decisions (ADR log), definition of done, and the full MVP backlog.
- `docs/changelog.md` — append-only project history (separate from `project-state.md`,
  which is a snapshot). Read this to understand how the project got to its current state.
- `.claude/CLAUDE.md` — the entry point Claude Code reads first: mission, stack,
  mandatory development loop, architecture, security.
- `.claude/rules/` — per-domain rules: architecture, backend, frontend, database, auth,
  security, resilience, extensibility, maps, testing, git.
- `.claude/agents/` — specialized subagents (architect, backend, frontend, database,
  reviewer).
- `.claude/commands/` — `/status /next /plan /implement /test /review`.
- `.claude/skills/` — auto-triggered procedures for recurring workflows (new cabinet
  feature, new API endpoint, DB migration, map provider change, security review, ADR).
- `.claude/context/` — persistent memory: `project-state.md` (current snapshot),
  `architecture-map.md`, `current-task.md`, `known-issues.md`.
- Root tooling: pnpm workspaces + Turborepo, ESLint + Prettier, Husky + lint-staged,
  GitHub Actions CI, Dependabot, Docker Compose (Postgres, Redis, MinIO).

## Claude Code workflow

```text
/status
/next
/plan
# user approves
/implement
/test
/review
# fix findings
/test
/review
```

The repository, not the chat history, is the long-term memory. `docs/changelog.md` is
the ordered history layer on top of `project-state.md`'s snapshot — read both before
non-trivial work; see `.claude/CLAUDE.md` → Context preservation protocol.

## Local infrastructure

```bash
docker compose up -d
pnpm install
```

Node version is pinned in `.nvmrc`. `pnpm install` also sets up the Husky pre-commit hook
(`prepare` script) which runs lint-staged.

## Fixed stack

See `docs/architecture.md` for the full list. Notably: Next.js 15 + Fastify + PostgreSQL/
Drizzle + Redis + 2GIS (maps, behind a swappable adapter — ADR-010) + Auth.js-compatible
email/password auth (ADR-006).

## Architecture posture

- **Modular monolith, not microservices** (ADR-008) — failure isolation via
  `.claude/rules/resilience.md`, not deployment topology.
- **Feature-module cabinets** (ADR-009) — organizer and participant dashboards are built
  as independently-extensible feature modules; see `.claude/rules/extensibility.md`.
- **Capability-based authorization** (ADR-006, sessions/topology in ADR-013) — no rigid role enum; a user can be both
  organizer and participant. Full checklist in `.claude/rules/security.md`.
- **Provider-swappable maps** (ADR-003, ADR-010) — 2GIS is the chosen provider, accessed
  only through `packages/maps-core`'s interface; `packages/maps-2gis` is the only package
  allowed to import the 2GIS SDK.

## Still open (see `docs/decisions.md` for full status)

- deployment: nothing exists yet — no Dockerfile, manifest, proxy config, backups or
  observability (`docs/tasks.md` → Deployment, `.claude/context/known-issues.md`);
- production notification provider (ADR-007, Pending);
- production S3 provider (ADR-005 accepted as capability; concrete provider is
  deployment-specific);
- real 2GIS API credentials (needed before CR-026/CR-028).
