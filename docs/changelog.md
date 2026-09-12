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
Commands (`/next`, `/status`) only need to read the last 5-10 entries of the _live_ file —
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

## 2026-09-12 — CR-087 — repository reformatted to match Prettier config

Summary: Ran `prettier --write .` across the whole repository as one isolated,
formatting-only commit, closing KI-011. `prettier --check .` now passes on all 37
previously-failing files (every markdown rules/skills/docs file, `docker-compose.yml`,
`.github/dependabot.yml`). Changes are purely cosmetic: blank lines around headings and
fenced code blocks, `*emphasis*` → `_emphasis_` markdown style, and YAML double quotes →
single quotes (semantically identical, no escape sequences involved). No content, rule,
or decision text changed; verified with `git diff -w` and manual review before commit.
Files: 37 files reformatted; no content changes. `docs/tasks.md` (CR-087 checked off),
`.claude/context/known-issues.md` (KI-011 resolved).
Decisions: none.
Follow-up: CI's `Format check` step should now pass once CI can run at all (still blocked
on CR-001 per KI-008). Next task: CR-001.

## 2026-09-12 — CR-001 — pnpm/Turborepo monorepo tooling initialized

Summary: Made the already-authored root tooling (`package.json`, `pnpm-workspace.yaml`,
`turbo.json`, root ESLint config, `.prettierrc`, Husky) actually operational. Ran
`pnpm install` (via `npx pnpm@10.34.5`, the exact pinned version — no pnpm/corepack
installed globally on this machine) to generate `pnpm-lock.yaml`; this is the fix for
KI-008 (CI's `pnpm install --frozen-lockfile` step had nothing to install against).
Husky's `prepare` script ran and wired `core.hooksPath` correctly. Added
`tsconfig.base.json` at the repo root: shared strict compiler options (`ES2022`,
`noUncheckedIndexedAccess`, `noImplicitOverride`, etc.) for every future `apps/*`/
`packages/*` member to extend — deliberately does not fix `module`/`moduleResolution`,
since Next.js (bundler resolution) and Fastify (NodeNext) need different values; each
package's own tsconfig decides that in CR-002/CR-003. Added `.prettierignore` for
`pnpm-lock.yaml` (a machine-generated file; Prettier reformatting it would fight pnpm's
own lockfile writer).

Verified locally against zero workspace packages (no `apps/*`/`packages/*` exist yet —
that is still CR-002..CR-007, not this task): `pnpm format:check`, `pnpm lint:root`
(root `eslint .`), and `turbo run lint|typecheck|test|build` all exit 0 (turbo correctly
reports "0 packages" rather than erroring).

Files: `pnpm-lock.yaml` (new), `tsconfig.base.json` (new), `.prettierignore` (new),
`.claude/context/architecture-map.md`, `docs/tasks.md` (CR-001 checked off),
`.claude/context/known-issues.md` (KI-008 resolved), `.claude/context/project-state.md`.
Dependencies: installed the devDependencies already declared in `package.json`
(`eslint`, `prettier`, `turbo`, `husky`, `lint-staged`, `typescript-eslint`,
`@eslint/js`) — no new packages added beyond what was already specified.
Decisions: none.
Follow-up: CR-002 (Configure Next.js web) is next; it and CR-003..CR-007 will create the
actual `apps/*`/`packages/*` directories and extend `tsconfig.base.json`.

## 2026-09-12 — CR-002 — apps/web scaffolded (Next.js 15 + Tailwind v4 + shadcn/ui foundation)

Summary: First real workspace member. `apps/web` is Next.js 15.5.25 (App Router,
`src/` directory per `.claude/rules/extensibility.md`'s feature-module layout), React
19.3.0, Tailwind CSS v4 (CSS-first config — no `tailwind.config.js`), and the shadcn/ui
foundation hand-written to match what `shadcn init` would generate (`components.json`,
`src/lib/utils.ts`'s `cn` helper, baseline neutral CSS-variable theme in
`globals.css`) — the interactive CLI has no way to answer its Tailwind v4 prompts
non-interactively in this environment. A single placeholder home page proves the app
builds/renders; it deliberately does not use any hard-coded brand color (`.claude/
rules/frontend.md`) since the real design tokens are CR-063, not this task.

Version pinning, checked against the npm registry before writing (not "latest" — fixed
stack pins Next **15**, and latest `next`/`typescript` at the time were 16.3.5/7.0.2):
`next@^15.5.25`, `react@^19.3.0`, `react-dom@^19.3.0`, `tailwindcss@^4.3.3` +
`@tailwindcss/postcss@^4.3.3`, `eslint-config-next@^15.5.25`, shadcn deps
(`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
`tw-animate-css`), `@eslint/eslintrc` (`eslint-config-next` still ships legacy-style
shareable configs, not a prebuilt flat export — bridged via `FlatCompat`, matching
Next's own documented ESLint 9 setup). **`typescript` is pinned exactly to `6.0.3`, not
a caret range**: `typescript-eslint@8.70.0` (already at the repo root) requires
`typescript >=4.8.4 <6.1.0`, and the registry's `latest` tag is already `7.0.2` (a new
major with a different architecture) — 6.0.3 is the newest release inside the
compatible range. Added the same exact pin to the root `devDependencies` (it was
previously only present as pnpm's own implicit peer resolution).

Two root-tooling fixes this task required, not scope creep — both were already implied
by comments/behavior that only became a real problem once a workspace member existed:

- `eslint.config.mjs` now ignores `apps/**`/`packages/**`. Verified empirically that
  ESLint flat config has no automatic directory cascading (one config wins per
  invocation, chosen by the process's CWD, not by each file's own directory) — without
  this, `pnpm lint:root`/lint-staged would try to lint Next/JSX files with the bare
  root config. This matches what the file's own comment already promised ("apps/* and
  packages/* will extend individually via turbo lint").
- Same CWD-resolution fact means lint-staged's pre-commit `eslint --fix` (CWD = repo
  root) can no longer reach `apps/web`'s own richer config either — recorded as KI-012,
  fix deferred to CR-010 ("Configure CI + Git hooks"). Added `--no-warn-ignored` to the
  lint-staged command so this shows up as silence, not console noise, in the meantime.
- `.gitignore`: added `.turbo`, `out`, `*.tsbuildinfo` (Prettier reads `.gitignore`
  automatically — confirmed empirically — so this also kept `.turbo/cache/*.json` out
  of `prettier --check`).

Also added `apps/web/src/css.d.ts` (`declare module '*.css'`): TypeScript 6.0.3 raises
TS2882 on the side-effect `import './globals.css'` in `app/layout.tsx` without it —
newer/stricter behavior than the TS versions most existing Next.js tutorials were
written against.

Verified: `turbo run lint|typecheck|build` all pass for `web`; `pnpm format:check` and
`pnpm lint:root` still pass at the repo root; `next build` output smoke-tested with
`next start` (`curl` returned 200 with the expected page text). No test runner wired
yet — that's CR-008.

Files: `apps/web/**` (new — package.json, tsconfig.json, next.config.ts,
next-env.d.ts, postcss.config.mjs, eslint.config.mjs, components.json, .gitignore,
src/app/{layout,page}.tsx, src/app/globals.css, src/lib/utils.ts, src/css.d.ts); root
`package.json` (pinned `typescript`, `--no-warn-ignored`), `eslint.config.mjs`,
`.gitignore`; `docs/tasks.md` (CR-002 checked off), `.claude/context/known-issues.md`
(KI-012), `.claude/context/{architecture-map,project-state,current-task}.md`.
Dependencies: see version list above — all new, none replace an existing choice.
Decisions: none (Tailwind v4 CSS-first config and shadcn/ui's default neutral theme
are implementation details of the already-fixed stack, not architectural decisions).
Follow-up: CR-003 (Configure Fastify API) is next. CR-063 replaces the placeholder
theme with real design tokens; CR-010 fixes the KI-012 pre-commit lint gap; CR-008
adds the test runner this app doesn't have yet.

## 2026-09-12 — CR-003 — apps/api scaffolded (Fastify 5 + Zod + RFC 9457 + OpenAPI)

Summary: Second workspace member. `apps/api` is Fastify 5.12.4 (ESM,
`"type": "module"`), TypeScript pinned to `6.0.3` (same `typescript-eslint`
compatibility ceiling as `apps/web`, see CR-002). Scope/design decisions were
gathered via a `/grill-me` interview session before implementation — six questions,
all recommended options accepted by the user:

1. ESM, not CommonJS.
2. OpenAPI wired now (`@fastify/swagger` + `@fastify/swagger-ui` + the official
   `@fastify/type-provider-zod` — confirmed via npm registry `repository.url` that
   this scoped package, not the community `turkerdev/fastify-type-provider-zod` it
   was migrated from, is current), not deferred until real routes exist.
3. `GET /health` ships now as a bootstrap stub (`{ status: 'ok' }`, no dependency
   checks) — `docs/api.md`/ADR-011 explicitly assign the real DB/Redis/S3-checking
   version to CR-051; this task only reserves the unversioned route.
4. RFC 9457 `type` URIs use `https://coffee-ride.example/errors/{code}`, the same
   placeholder domain ADR-011's own example already uses.
5. The API's listen port is `API_PORT`, not bare `PORT` (ambiguous once web and api
   share one `.env` in local dev).
6. Zod env validation (CR-073) covers the _full_ `.env.example` surface now,
   including variables no code reads yet, not just what CR-003 itself introduces.

Implementation:

- `@fastify/type-provider-zod` gives typed Zod request/response validation and
  drives OpenAPI generation (`jsonSchemaTransform`) from the same route schemas —
  no hand-maintained OpenAPI file. Swagger UI at `/docs`, spec at `/docs/json`.
- Global error handler (`src/plugins/error-handler.ts`) produces the exact RFC 9457
  shape from `docs/api.md` for every non-2xx response: 404s, Zod validation
  failures (mapped into `errors[]` via `hasZodFastifySchemaValidationErrors`), and
  any other thrown error (5xx bodies never include the real error — only a generic
  message; the real error is logged server-side via `request.log`, per
  `.claude/rules/backend.md`).
- `/v1` is registered as an (empty) prefixed plugin now, `/health` outside it — the
  versioning convention exists structurally before the first real route (CR-011).
- `src/env.ts` (CR-073): Zod schema for every `.env.example` variable, including
  ones no client exists for yet (`DATABASE_URL`, `REDIS_URL`, `S3_*`,
  `MAPS_2GIS_API_KEY` — optional, since nothing reads them yet, but typed and
  placeholder-checked for when something does). Refuses to boot when
  `NODE_ENV=production` and a value matches a known-unsafe default: `AUTH_SECRET
=== 'change-me'` (the exact promise `.env.example`'s own comment already made),
  the MinIO local credentials, or `localhost`/`127.0.0.1` in `DATABASE_URL`/
  `REDIS_URL`/`S3_ENDPOINT`. Error messages name the field and reason, never the
  offending value (`.claude/rules/security.md`: never log secrets).
- Local dev loads one root `.env` (matching `.env.example`'s existing location) via
  Node 24's native `process.loadEnvFile()` — no `dotenv` dependency. Production
  reads real platform environment variables; a missing `.env` file is not an error.
- No CORS plugin (ADR-013: single origin, not a supported configuration to add
  "just in case"). No rate limiting yet — `.claude/rules/security.md` scopes that
  to "the first auth-related task (CR-011/CR-012) onward," and no Redis client
  exists yet (CR-005) to back it.
- `apps/api/eslint.config.mjs`: own copy of the plain typescript-eslint flat config
  (no framework-specific plugin needed for a bare Fastify app) — required, not
  optional, since root's `eslint.config.mjs` already ignores `apps/**` (CR-002).

Verified live, not just typechecked: `turbo run lint|typecheck|build` all pass for
`api` (and `web` stays green — regression check); dev server (`tsx watch`) boots and
`curl`'d `/health` (200), an unknown route (404 with the documented envelope), and a
temporary Zod-validated test route with a bad payload (400, `errors[]` correctly
populated with `path`/`message` — route removed before commit, was never shipped);
compiled `dist/server.js` boots identically to `tsx` dev mode; a simulated
production boot with `AUTH_SECRET=change-me` correctly refuses to start with the
expected message, and a boot missing `AUTH_SECRET` entirely correctly refuses too.

Files: `apps/api/**` (new — package.json, tsconfig.json, eslint.config.mjs,
.gitignore, src/{env,app,server}.ts, src/plugins/{error-handler,openapi}.ts,
src/routes/{health,v1}.ts); `.env.example` (`API_PORT`), `turbo.json` (`API_PORT` in
every task's env list); `docs/tasks.md` (CR-003 and CR-073 checked off),
`.claude/context/{architecture-map,project-state,current-task}.md`.
Dependencies: `fastify`, `zod`, `@fastify/type-provider-zod`, `@fastify/swagger`,
`@fastify/swagger-ui` (runtime); `tsx`, `pino-pretty`, `typescript`, `@types/node`,
`eslint`, `@eslint/js`, `typescript-eslint` (dev — mirrors `apps/web`'s own copies,
`packages/config` doesn't exist yet to centralize this, CR-007).
Decisions: none new at the ADR level — OpenAPI-from-Zod and the placeholder `type`
base URI are implementation details of contracts already fixed by ADR-011, not new
architectural decisions.
Follow-up: CR-004 (Configure PostgreSQL + Drizzle) is next. CR-051 upgrades
`/health`; CR-011 adds the first real `/v1` route and exercises this scaffold for
real; CR-057/CR-058 add password hashing and auth rate limiting once Redis exists.

## 2026-09-12 — CR-004 — packages/db scaffolded (Drizzle + Postgres, zero domain tables)

Summary: Third workspace member, first under `packages/*`. `packages/db` is
Drizzle ORM on the `postgres-js` driver (`drizzle-orm@^0.45.2`, `postgres@^3.4.9`)
plus `drizzle-kit@^0.31.10` for migrations, TypeScript pinned to `6.0.3` (same
`typescript-eslint` ceiling as `apps/web`/`apps/api`).

Asked the user one direct question before implementing (not a full `/grill-me`
session — a single scope fork, not a multi-branch design tree): ship an empty
schema (tooling only) or a first `users` table now. The recommended, chosen
answer was the empty schema — `packages/db` owns the client/migration tooling,
zero domain tables; the `users` table (and every other domain table) is added
later via the `db-migration` skill, at the point a real feature needs it
(starting CR-011, User registration), the same way CR-002/CR-003 shipped zero
domain routes/screens.

`src/client.ts` exports `createDbClient(connectionString)` — a factory, not a
global singleton reading `process.env` itself: `packages/db` is a library
(`.claude/rules/architecture.md`), `apps/api` owns env validation and will pass
in an already-validated `DATABASE_URL` once it actually needs the client
(CR-011 — this task deliberately does NOT wire `apps/api` to depend on
`packages/db` yet, keeping the diff scoped like CR-002/CR-003 didn't touch each
other). `src/migrate.ts` is a standalone script (reads `DATABASE_URL` directly,
same as `drizzle.config.ts` — CLI tooling, not app runtime code) that applies
pending migrations; CR-076 ("migrations as an explicit deploy step") reuses it
later. `drizzle-kit generate` (never `push`) produces real, committed SQL
migration files per `.claude/rules/database.md`.

Validated live, not just typechecked — with a real caveat: Docker's daemon did
not come up in this environment (`docker compose up postgres` failed to
connect, and it didn't finish starting within several minutes), so validation
ran against the machine's existing local Homebrew PostgreSQL 14 instead, using
a scratch database. Confirmed the full pipeline: temporarily added a scratch
table to the schema, ran `drizzle-kit generate` (produced a real migration
file), applied it via `src/migrate.ts`, verified the table via both raw `psql`
and a query through `createDbClient` (proving the client factory + schema
typing work end-to-end, not just the SQL), then removed the scratch table, its
migration file, and the scratch database entirely — same discipline as
CR-002/CR-003's temporary test routes. What's actually committed is the
genuine state `drizzle-kit generate` leaves behind for a zero-table schema:
`migrations/meta/_journal.json` with an empty entry list, ready for CR-011's
first real migration to extend.

Discovered and fixed: TypeScript's automatic `@types` inclusion did not pick up
Node's ambient globals (`process`, `console`, `URL`, `import.meta.url`) in
`src/migrate.ts`, even with `@types/node` correctly installed — needed an
explicit `"types": ["node"]` in `packages/db/tsconfig.json`. `apps/api` never
hit this, apparently because every file there already imports something from
`fastify`, which itself references Node builtin types and incidentally pulls in
`@types/node`; `migrate.ts` uses only bare globals with no `node:`-prefixed
import, so nothing forced the inclusion. Recorded as KI-013 — CR-007 should put
`"types": ["node"]` in the shared Node-target tsconfig fragment
`packages/config` will own, so future packages don't rediscover this.
`.prettierignore` also gained `**/migrations/meta/**` (drizzle-kit writes these
itself, same reasoning as `pnpm-lock.yaml` already being excluded).

Files: `packages/db/**` (new — package.json, tsconfig.json, eslint.config.mjs,
.gitignore, drizzle.config.ts, src/schema/index.ts, src/client.ts,
src/migrate.ts, migrations/meta/_journal.json); `.prettierignore`;
`docs/tasks.md` (CR-004 checked off); `.claude/context/{architecture-map,
project-state,known-issues,current-task}.md` (KI-013).
Dependencies: `drizzle-orm`, `postgres` (runtime); `drizzle-kit`, `tsx`,
`typescript`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint` (dev —
mirrors `apps/api`'s own copies, `packages/config` doesn't exist yet, CR-007).
Decisions: none new at the ADR level.
Follow-up: CR-005 (Configure Redis) is next. CR-011 adds the first real table
(`users`) and wires `apps/api` to depend on `packages/db`, exercising this
scaffold for real.
