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

## 2026-09-11 — Audit — pre-foundation readiness review (scaling + deployment)

Summary: At the user's request ("check everything, I will scale it and deploy it to a
remote server"), audited the whole repository — configs, CI, infrastructure and contracts
— since no application code exists yet. Found 23 issues and sorted them by one criterion:
reversible or not. Irreversible ones (contract shape, data model, toolchain, secrets
layout) were fixed now, before code exists; reversible ones (Dockerfile, backups,
monitoring, Redis hardening, CI gaps) were written down as tracked tasks rather than built
against an application that does not exist yet.

Rationale for not "preparing everything first": the project already had twelve
specification documents against zero lines of code, and the backlog already contains
CR-044..048 and CR-049..052 as the "come back and harden" mechanism. Another preparation
round would have deepened the imbalance.

Files: `.claude/context/known-issues.md` (rewritten — 10 open, 5 resolved entries),
`docs/tasks.md` (three new sections: Pre-foundation hardening, Deployment, Contract &
model follow-ups — CR-067..CR-086).
Decisions: ADR-011, ADR-012, ADR-013 — see the three entries below.
Follow-up: CR-073 (env validation) lands inside CR-003; the Deployment section is picked
up when there is something to deploy.

## 2026-09-11 — CR-067/CR-068 — toolchain and build environment fixed

Summary: Node 20 was still pinned in `.nvmrc`/`engines` despite reaching end-of-life in
April 2026 — moved to Node 24 LTS (supported to April 2028). `packageManager` held
`pnpm@10`, an incomplete descriptor that Corepack rejects and that also made
`pnpm/action-setup` receive the version twice (from the action input and from
`package.json`) — pinned to `pnpm@10.34.5` and dropped the duplicate `version:` input.

`turbo.json` declared no environment at all, which matters because Turborepo 2 defaults to
strict environment mode: tasks only receive variables that are declared. Left as it was,
`next build` would have run without `NEXT_PUBLIC_*` and tests without `DATABASE_URL`, and
the cache hash would not have tracked environment changes — a class of bug that looks like
"configuration mysteriously empty". Declared `globalEnv`/`globalPassThroughEnv` and
per-task `env`, and excluded `.next/cache/**` from build outputs.

Two adjacent CI fixes while in the file: `pnpm lint` only walks workspace packages (none
exist yet), so the root `eslint.config.mjs` was never actually executed in CI — added a
`lint:root` step; and the workflow had no `permissions:` block — set `contents: read`.

Files: `.nvmrc`, `package.json`, `turbo.json`, `.github/workflows/ci.yml`.
Decisions: none (toolchain, not architecture).
Follow-up: none.

## 2026-09-11 — CR-071/CR-072 — secrets layout and port bindings

Summary: `.env.example` exposed one `NEXT_PUBLIC_MAPS_2GIS_API_KEY` for every 2GIS
product. MapGL legitimately ships in the browser bundle, but Geocoder and Directions are
billed per request and must be called server-side — a single public key would have put a
metered credential into every visitor's browser, against `.claude/rules/security.md`. Split
into `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (public, domain-restricted) and `MAPS_2GIS_API_KEY`
(server-only, `apps/api`/`packages/maps-2gis`), each with a comment explaining why it must
stay on its side.

`docker-compose.yml` published Postgres, Redis and MinIO on `0.0.0.0`. Harmless on a
laptop, but on a host with a public IP that is three databases on the internet — bound
them all to `127.0.0.1` and added a header comment explaining why the binding must not be
widened, since this file will be read on a server eventually.

Also documented how to generate `AUTH_SECRET` and noted that the API will refuse to boot
in production on the placeholder (CR-073).

Files: `.env.example`, `docker-compose.yml`.
Decisions: none (security hygiene, not architecture).
Follow-up: CR-073 implements the startup validation this comment promises.

## 2026-09-11 — ADR-011 — API contract fixed before the first endpoint

Summary: Three contract decisions taken while there are zero clients: all application
endpoints move under `/v1` (`/health` stays unversioned, it is consumed by the deployment
platform); every collection endpoint is cursor-paginated (`?limit=`/`?cursor=` →
`{ items, nextCursor }`, default 20, max 100); every error is RFC 9457
`application/problem+json` with a stable machine-readable `code` and per-field `errors[]`
for Zod failures.

Cursor rather than offset because the ride feed is sorted by start date and rides publish
continuously — offset pagination silently skips and duplicates rows whenever the set
shifts between requests, which is exactly what happens on the two lists that grow without
bound (discovery and a popular ride's participant list).

All three were markdown edits today; after forty endpoints exist they would each be a
breaking change for every client.

Files: `docs/decisions.md` (ADR-011), `docs/api.md` (rewritten with `/v1`, Pagination and
Errors sections), `.claude/rules/backend.md` (links to ADR-011 so the acting agent reads
it).
Decisions: ADR-011.
Follow-up: none — the rule applies to every endpoint task from CR-011 onward.

## 2026-09-11 — ADR-012 — time storage fixed before the schema exists

Summary: Every timestamp column is `timestamptz`; bare `timestamp` is not used anywhere.
Additionally, `Ride` stores the IANA timezone of its start location.

Russia spans eleven offsets, so "the ride starts at 08:00" is meaningless without knowing
where. The instant answers "has it started yet"; the zone answers "what did the organizer
mean and what should each participant see" — a participant in Moscow must not be shown
04:00 for an 08:00 Krasnoyarsk ride. Store the identifier, never a fixed `+07:00` offset:
offsets expire, zone identifiers survive tzdata updates.

Deciding this before `packages/db` exists is the entire point — converting a populated
`timestamp` column later means guessing, per row, which zone it was written in, and that
information no longer exists by then.

Files: `docs/decisions.md` (ADR-012), `docs/database.md` (new Time section),
`.claude/rules/database.md`.
Decisions: ADR-012.
Follow-up: CR-004 implements it in the schema.

## 2026-09-11 — ADR-013 — session store and origin topology decided

Summary: Resolves the part of ADR-006 that had been Pending since it was written (backlog
CR-062), and the deployment topology it depends on — the cookie policy is only decidable
once the origin layout is known, so both were decided together after discussion with the
user.

Sessions are database-backed: the cookie carries an opaque token, the `Session` row stores
its SHA-256 hash (a database dump must not hand over working sessions). Cookie is
httpOnly/Secure/SameSite=Lax, 30 days, extended at most once per day. Logout deletes the
row; a password change revokes every session of that user. The deciding argument over JWT
was revocation, not performance: this platform holds participant contact and emergency
data, so "log out everywhere" and "block this account" must take effect immediately, and a
JWT would need a revocation list — reintroducing server-side state in a second store.

Topology: one origin — `example.com` serves Next.js, `example.com/api/*` is proxied to
Fastify. Consequences, all deliberate: no CORS at all; `SameSite=Lax` needs no
`SameSite=None` exception; CSRF protection is `SameSite=Lax` plus an `Origin`/`Referer`
check on unsafe methods, which is the concrete mechanism `.claude/rules/security.md`
required to be recorded rather than left implicit.

ADR-006's own text was left untouched per the append-only rule; only its `Status:` line now
points at ADR-013.

Files: `docs/decisions.md` (ADR-013 + ADR-006 status line), `.claude/rules/security.md`
(session and CSRF/CORS rules), `docs/auth.md` (session shape + "before production"
checklist items now resolved), `docs/tasks.md` (CR-062 checked off).
Decisions: ADR-013.
Follow-up: CR-012 implements it. A future mobile client cannot use browser cookies the
same way — that gets its own ADR when it actually exists, not now.

## 2026-09-11 — Audit follow-up — repository has never matched its own Prettier config

Summary: While validating the changes above, `prettier --check .` failed on 37 files —
and failed identically on the initial commit, so this predates all current work. CI's
`Format check` step therefore fails before reaching lint or typecheck, for reasons
unrelated to whatever is being tested. The differences are purely cosmetic (blank lines
after headings and before lists) but rewrite every markdown file end to end, so they were
deliberately NOT folded into today's content changes — `.claude/rules/git.md` forbids
mixing unrelated refactors with substantive work, and a few hundred lines of whitespace
churn would have buried the actual diff.
Files: none changed for this entry; recorded as CR-087 and KI-011.
Decisions: none.
Follow-up: CR-087 — run Prettier over the repository as one formatting-only commit.
