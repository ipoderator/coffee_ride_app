# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~40 entries, move all but the most recent ~15 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly.
Leave a one-line pointer at the top of this file's history section noting the archive exists.
Commands (`/next`, `/status`) only need to read the last 5-10 entries of the *live* file —
the archive exists for humans and for deep audits, not for routine agent context.

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed, in 1-3 sentences.
Files: key files/dirs touched.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

---

## 2026-09-09 — CR-000 — Harness created

Summary: Initial Claude Code harness (v3) created: docs, `.claude/` rules/agents/commands,
persistent context files, Docker Compose local infra, monorepo tooling config. No
application code yet.
Files: `docs/`, `.claude/`, root config files.
Decisions: ADR-001 through ADR-007 recorded in `docs/decisions.md`.
Follow-up: CR-001 (initialize pnpm/Turborepo monorepo) is next.

## 2026-09-09 — Harness update — tooling + append-only memory

Summary: Added missing tooling (ESLint flat config, lint-staged + husky pre-commit hook,
GitHub Actions CI, dependabot, .nvmrc/engines, editorconfig, VS Code recommendations) so
`/test`/`/review` have something to run once CR-001 lands. Introduced this file
(`docs/changelog.md`) as an append-only long-term memory layer, wired into `CLAUDE.md`,
`/implement`, `/status`, `/next`, and `definition-of-done.md`.
Files: `package.json`, `eslint.config.mjs`, `.husky/pre-commit`,
`.github/workflows/ci.yml`, `.github/dependabot.yml`, `.nvmrc`, `.editorconfig`,
`.vscode/*`, `docs/changelog.md`, `.claude/CLAUDE.md`, `.claude/commands/*`,
`docs/definition-of-done.md`.
Decisions: none (tooling additions, not architectural).
Follow-up: none.

## 2026-09-09 — ADR-008 — Modular monolith over microservices

Summary: Explicitly decided (at user's request, after discussing the tradeoff) that the
project stays a modular monolith rather than adopting microservices, to avoid trading
transactional integrity (registration/capacity invariants) for network-boundary complexity
at MVP stage. Added `.claude/rules/resilience.md` defining how failure isolation is
actually achieved instead: timeouts/retries/circuit breakers on external calls (Yandex
Maps, S3, notifications), async queue-based delivery for non-critical side effects, health
checks, and strict internal module boundaries kept as future extraction seams.
Files: `docs/decisions.md` (ADR-008), `.claude/rules/resilience.md`, `docs/architecture.md`,
`.claude/CLAUDE.md`, `.claude/context/architecture-map.md`, `docs/tasks.md` (CR-049..CR-052).
Decisions: ADR-008 in `docs/decisions.md`.
Follow-up: CR-049 through CR-052 implement the actual resilience mechanisms; not yet started.

## 2026-09-09 — Harness update — switched maps provider: Yandex Maps → 2GIS

Summary: Replaced the maps provider across all docs/rules/config from Yandex Maps to 2GIS
(MapGL JS API + Geocoder API + Directions/Routing API), per user's decision to use the
2GIS API. ADR-003 marked superseded (not deleted, per append-only ADR discipline) rather
than rewritten. Env var renamed `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` →
`NEXT_PUBLIC_MAPS_2GIS_API_KEY`.
Files: `docs/decisions.md` (ADR-003), `docs/architecture.md`, `docs/maps.md`,
`docs/tasks.md` (CR-049), `.env.example`, `.claude/CLAUDE.md`, `.claude/rules/maps.md`,
`.claude/rules/frontend.md`, `.claude/rules/resilience.md`,
`.claude/context/architecture-map.md`.
Decisions: ADR-003 updated/superseded in `docs/decisions.md`.
Follow-up: obtain a real 2GIS API key before CR-026/CR-028 (map-dependent tasks); verify
2GIS coverage/licensing for target cities during implementation, per `docs/maps.md`
production checklist.

## 2026-09-09 — Harness update — extensibility, security/authz, swappable maps adapter

Summary: At user's request, added three architectural layers ahead of implementation
since both cabinets (organizer, participant) will keep growing after MVP: (1) ADR-009 +
`.claude/rules/extensibility.md` — feature-module structure, registry-over-branching for
shared surfaces, additive-only shared contracts, feature flags for risky rollouts; (2)
ADR-006 rewritten from Pending-stub to a concrete email+password, capability-based
authorization architecture, backed by an expanded `.claude/rules/security.md` (password
hashing, rate limiting, session/cookie policy, CSRF, headers, audit trail) and a rewritten
`docs/auth.md`; (3) ADR-010 + adapter package split (`packages/maps-core` /
`packages/maps-2gis`) with a full `MapProvider` interface contract in
`.claude/rules/maps.md`, so the 2GIS choice (ADR-003) stays swappable without touching
ride/route/discovery feature code, even though 2GIS is expected to remain the provider.
Updated all five `.claude/agents/*.md` to reference the relevant new rules files, since
rules that aren't read by the acting agent don't get applied.
Files: `docs/decisions.md` (ADR-006 rewritten, ADR-009, ADR-010 added),
`.claude/rules/extensibility.md` (new), `.claude/rules/security.md` (expanded),
`.claude/rules/maps.md` (adapter contract added), `docs/auth.md` (rewritten),
`docs/architecture.md`, `.claude/CLAUDE.md`, `.claude/context/project-state.md`,
`.claude/agents/*.md`, `docs/tasks.md` (CR-053..CR-062).
Decisions: ADR-006 (rewritten), ADR-009, ADR-010 in `docs/decisions.md`.
Follow-up: CR-053 through CR-062 are the implementation tasks; concrete session store
(database-backed vs JWT) is still an open sub-decision within ADR-006, to be resolved at
CR-062/CR-012.

## 2026-09-09 — Harness update — project skills added

Summary: Added `.claude/skills/` with six project-specific skills encoding the project's
most-repeated workflows as step-by-step procedures: `new-cabinet-feature` (ADR-009),
`new-api-endpoint` (backend.md/security.md layering+authz), `db-migration`
(database.md invariant-protecting constraints), `map-provider-change` (ADR-010 adapter
swap), `security-review` (systematic walkthrough of security.md), and `adr` (how this
project records architectural decisions — append-only, supersede don't delete). Each
skill points back to its underlying rules/decisions file rather than duplicating content,
so the rules file stays the single source of truth. Referenced them from `CLAUDE.md`.
Files: `.claude/skills/*/SKILL.md` (6 new), `.claude/CLAUDE.md`.
Decisions: none (tooling/process, not architecture).
Follow-up: none.

## 2026-09-09 — Harness update — consistency audit and drift fixes

Summary: Full audit of the harness at user's request ("check what we forgot"). Found and
fixed six real drift points where earlier additions (resilience/security/extensibility/
maps-adapter work) hadn't propagated everywhere they should have: (1) `README.md` was
still "Harness v3" and didn't mention any tooling, memory system, or architecture work
added since — rewritten to reflect current state; (2) `.claude/rules/architecture.md` and
`.claude/context/architecture-map.md` package lists were missing `packages/maps-core`/
`packages/maps-2gis` — added, plus an explicit dependency-direction rule restricting
`maps-2gis` imports to a single composition point; (3) `.claude/rules/auth.md` had
drifted into a stale duplicate of `.claude/rules/security.md` (still described auth
provider as undecided after ADR-006 resolved it) — turned into a thin pointer instead of
a second source of truth; (4) `.claude/rules/testing.md` had no coverage guidance for
security/resilience/extensibility/maps-adapter concerns despite those rules files
existing — added; (5) `docs/api.md` was missing endpoints already implied by `docs/
auth.md` (verify-email, forgot/reset-password) and CR-051 (`/health`) — added; (6) minor:
`docker-compose.yml` MinIO service had no healthcheck unlike postgres/redis — added.
Also added a step to `.claude/rules/architecture.md`'s Change control section requiring
the relevant rules file to be updated alongside any ADR, specifically to prevent this
class of drift recurring.
Files: `README.md` (rewritten), `.claude/rules/architecture.md`,
`.claude/context/architecture-map.md`, `.claude/rules/auth.md` (consolidated),
`.claude/rules/testing.md`, `docs/api.md`, `docker-compose.yml`,
`.claude/context/project-state.md`.
Decisions: none (consistency fixes, not new architecture).
Follow-up: none outstanding from this audit; re-run this kind of check periodically as
more rules files accumulate.

## 2026-09-10 — Infra — git repository initialized and pushed to GitHub

Summary: The working directory was not a git repository at all, which broke the parts of
the harness that assume one: the "review git diff" step of the mandatory development loop,
`.claude/rules/git.md`, the Husky pre-commit hook, and GitHub Actions CI. Ran `git init -b
main`, committed the entire harness as a single initial commit, and pushed to the user's
remote `https://github.com/ipoderator/coffee_ride_app` (public). Verified before pushing
that no secrets are tracked: `.env` is gitignored and only `.env.example` with placeholder
values (`AUTH_SECRET=change-me`, empty `NEXT_PUBLIC_MAPS_2GIS_API_KEY`) is committed.
Files: all 59 harness/spec/tooling files (initial commit `2642f31`); no content changes.
Decisions: none (infrastructure, not architecture). Default branch is `main`, matching
`.github/workflows/ci.yml`.
Follow-up: CI will fail its `pnpm install --frozen-lockfile` step until CR-001 produces a
`pnpm-lock.yaml` — expected, not a regression. CR-001 (initialize pnpm/Turborepo monorepo)
is next.

## 2026-09-10 — Design — UX/UI specification added (`docs/design.md`)

Summary: The project had no design layer at all — only "Tailwind + shadcn/ui" as a stack
choice and two flow lines in `.claude/rules/frontend.md`. Added `docs/design.md` covering
visual direction, color tokens, typography, spacing, metric presentation, Russian
number/date formatting, screen inventory, component inventory, required UI states,
breakpoints, WCAG 2.1 AA target, and the Russian UI terminology table.

Direction per user: calm and low-saturation — no neon, no vivid accents, no bright red.
Warm neutral base, one muted teal-green accent. Every palette token's contrast ratio was
computed against its theme background before being written down; light `text-muted` and
the form-control border were adjusted after an initial pair failed AA (4.44:1 and 1.34:1),
so the AA claim in the document is verified rather than asserted.

Recorded one deliberate deviation from "no red": destructive/error semantics use a muted
brick tone (`#8F4F47`), restricted to text/icon/1px borders and always paired with a word
or icon, because cancellation and validation failure must stay distinguishable from
neutral states. Documented in §1 rather than decided silently.

Metric presentation is modeled on Strava/TrainingPeaks/FinalSurge/Zwift/Rouvy per user's
reference list — their information design (metric row, label→value→unit hierarchy,
tabular numerals, elevation profile, discrete difficulty scale), explicitly not their
branding (Strava orange, Zwift neon), which conflicts with the calm direction.

Files: `docs/design.md` (new), `docs/tasks.md` (CR-063..CR-066 added; CR-044/045/046
reframed as audits over screens already built to the spec, not the place UI quality
starts), `.claude/rules/frontend.md` (pointer to `docs/design.md` + metrics/a11y rules —
a rules file the acting agent reads, so the spec doesn't sit unread).
Decisions: none — palette/typography are product design, not architecture. The
implementation constraint (tokens live in `packages/ui`, consumed via the Tailwind theme,
no raw hex in `apps/web`) is recorded in `docs/design.md` §14 and enforced by CR-063.
Follow-up: CR-063 and CR-064 must land before CR-011's register form — the first screen
with user-visible Russian strings and colors. Open questions (cover-image aspect ratio,
map clustering, wordmark) are listed in `docs/design.md` §15.

## 2026-09-10 — Design — cancellation uses a bright red (revises the muted-brick draft)

Summary: Reviewing the rendered token preview, the product owner decided that "Отменён"
should be a genuinely bright red rather than the muted brick tone recorded earlier the same
day. Applied: `danger` is now `#D42B20` (light) / `#FF5A4F` (dark), and the cancelled badge
is a filled badge rather than text-and-border only. Both values were contrast-checked
before being written down — 4.79:1 and 5.88:1 against their theme grounds, and 5.04:1 /
5.88:1 for the label on the filled badge, so AA holds for the louder treatment too.
An `on-danger` token was added for text on that fill.

This revises, but does not erase, the exception paragraph written earlier today in
`docs/design.md` §1: the earlier entry in this changelog stands as written, per the
append-only rule. What changed is the hue and the permission to fill; what did not change
is that red stays reserved for destructive/failed states and never appears without a word
or icon beside it.

Also recorded the typeface actually used in the preview: Golos Text (Paratype) replaces
"Inter as an optional upgrade" in §4 as the recommended face, because it is drawn for
Russian text rather than merely covering Cyrillic; IBM Plex Mono is named as the utility
face for hex/IDs.

Files: `docs/design.md` (§1 exception rewritten, §3 danger/on-danger rows in both themes,
§4 typeface), `.claude/context/project-state.md`.
Decisions: none — palette revision, not architecture.
Follow-up: CR-063 implements these tokens. Remaining design open questions unchanged
(`docs/design.md` §15).
