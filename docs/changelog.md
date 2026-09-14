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

## 2026-09-12 — CR-005 — Redis client factory added to apps/api

Summary: Adds a Redis client factory directly to `apps/api` — no separate
`packages/redis`, since `.claude/rules/architecture.md`'s package list doesn't
call one out (unlike `packages/db`, which architecture.md explicitly assigns
"schema/migrations/client"); Redis here is a plain connection with no schema to
own, and `apps/api` is the only consumer per the fixed stack (`apps/web` never
touches it). `src/redis.ts` exports `createRedisClient(url, options?)` — same
factory shape as `packages/db`'s `createDbClient` — using `ioredis@^6.0.0`
rather than the official `redis` package, because CR-050 ("Async notification
delivery via Redis queue") will almost certainly use BullMQ, which requires
`ioredis`; picking it now avoids a client swap later.

Not wired into `app.ts` or any route in this task: ADR-004 ("Use for caching,
rate limiting, and jobs only when justified") means there is no justified
consumer yet — the notification queue is CR-050, rate limiting is CR-058.
`REDIS_URL` stays optional in `src/env.ts` (already added in CR-003; still
nothing reads it). Same "factory exists, not consumed yet" discipline CR-004
used for `packages/db`.

Honest gap, not silently skipped: attempted live validation the same way as
CR-004 (`docker compose up redis`), but Docker's daemon did not come up in this
environment — and unlike CR-004, there was no already-running local Redis to
fall back to. Installing one via Homebrew for this session was explicitly
declined by the user, so `src/redis.ts` was only typechecked/linted/built, never
actually connected to a live Redis. Recorded as KI-014, to be closed once
whichever of CR-050/CR-058 first wires this client into a real code path (or
sooner, if Docker becomes available).

One typing fix along the way: `ioredis@6.0.0`'s default export isn't
constructable under this project's `esModuleInterop`/`moduleResolution:
NodeNext` settings (`TS2351`), even though it works fine at runtime — switched
to the named `{ Redis }` export, which does carry a proper construct signature.

Files: `apps/api/package.json` (`ioredis`), `apps/api/src/redis.ts` (new);
`docs/tasks.md` (CR-005 checked off); `.claude/context/{architecture-map,
project-state,known-issues,current-task}.md` (KI-014).
Dependencies: `ioredis` (runtime).
Decisions: none new at the ADR level — the driver choice is an implementation
detail of the capability ADR-004 already accepted.
Follow-up: CR-006 (Configure MinIO/S3 adapter) is next. CR-050/CR-058 are the
first real consumers of this client and should close KI-014 when they land.

## 2026-09-12 — CR-006 — S3 client factory added to apps/api

Summary: Adds an S3-compatible client factory directly to `apps/api` — no
separate `packages/storage-*` split. Unlike maps (ADR-010 explicitly splits
`packages/maps-core`/`packages/maps-2gis` because the 2GIS SDK is
vendor-specific and must never leak into domain types), S3 is already a
standardized wire protocol: MinIO locally, and ADR-005 leaves the production
provider deployment-specific rather than pinning MinIO itself. `src/s3.ts`
exports `createS3Client(config)` — same factory shape as `createDbClient`/
`createRedisClient` — using `@aws-sdk/client-s3@^3.1131.0` rather than MinIO's
own client, since the AWS SDK speaks the same protocol against every
S3-compatible provider (AWS S3, MinIO, Cloudflare R2, Backblaze B2,
DigitalOcean Spaces, ...) and there's no vendor lock-in to avoid by picking
MinIO's SDK instead. `forcePathStyle: true` is set unconditionally — required
for MinIO and most non-AWS providers, since virtual-hosted-style bucket URLs
don't resolve against them.

Not wired into any route/use case in this task: the first real consumer (GPX
upload, CR-027; cover images, CR-086 — which still has to decide "direct S3 vs
proxy" serving) also applies the resilience wrapping from CR-049
(timeout/bounded-retry/circuit-breaker/"upload unavailable" fallback per
`.claude/rules/resilience.md`) at the call site — none of that belongs in a
bootstrap client factory. `S3_*` env vars stay optional in `src/env.ts`
(already added in CR-003).

Live validation gap, third occurrence: attempted `docker compose up minio`,
but Docker's daemon has now failed to come up in this environment across all
of CR-004, CR-005, and CR-006. Unlike CR-004 (local Homebrew Postgres was
already running) there is no equivalent always-on local MinIO fallback, and
installing one wasn't attempted again after CR-005's Redis install was
declined. `src/s3.ts` was only typechecked/linted/built. Recorded as KI-015.
Because this is now a confirmed, repeating environment constraint rather than
one-off flakiness, it's also recorded in Claude's cross-session project memory
(`docker-desktop-unavailable`) so future work in this repo doesn't re-spend
several minutes waiting on `docker info` before falling back — the fallback
strategy per service is decided once, not rediscovered per task.

Files: `apps/api/package.json` (`@aws-sdk/client-s3`), `apps/api/src/s3.ts`
(new); `docs/tasks.md` (CR-006 checked off); `.claude/context/{architecture-map,
project-state,known-issues,current-task}.md` (KI-015).
Dependencies: `@aws-sdk/client-s3` (runtime).
Decisions: none new at the ADR level — the client choice is an implementation
detail of the capability ADR-005 already accepted.
Follow-up: CR-007 (Configure shared packages) is next. CR-027/CR-086 are the
first real consumers of this client and should close KI-015 when they land;
CR-049 adds the resilience wrapping both this and the Redis client (CR-005)
still lack.

## 2026-09-12 — CR-007 — Five shared packages configured (config, types, ui, maps-core, maps-2gis)

Summary: `packages/db` was the only `packages/*` member before this task; CR-007
adds the rest of `.claude/rules/architecture.md`'s list.

**`packages/config`** (new, not itself in that list — introduced to close
KI-013 properly): a shared Node-library tsconfig fragment
(`tsconfig/node-library.json`, bakes in `"types": ["node"]` so a future
package with only bare Node globals doesn't rediscover KI-013) and a shared
ESLint flat-config factory (`eslint/node-library.js`,
`nodeLibraryConfig()`) that replaces the copy-pasted recommended-configs-plus-
house-rules block `packages/db` and `apps/api` each hand-wrote. Every
workspace member still needs its own `eslint.config.mjs` file — flat config
has no directory cascading, `turbo lint` resolves one config per package by
CWD (KI-012) — but that file is now one line for a plain Node package.
`apps/api`/`packages/db` are deliberately NOT retrofitted onto this in the
same change (`.claude/rules/git.md`: don't mix unrelated refactors with
feature work); optional future cleanup, not a regression.

One tsconfig gotcha discovered while wiring this up: `outDir`/`rootDir` (and
other path-valued compiler options) resolve relative to the file that
_defines_ them, not the file that `extends` it — so they cannot live in the
shared fragment itself (confirmed via `TS6059` when they did). They stay in
each consuming package's own `tsconfig.json`, same as `apps/api`/
`packages/db` already do it.

**`packages/types`**: `ProblemDetails` (RFC 9457 envelope) and `Paginated<T>`
(ADR-011 cursor pagination) — the two API contract shapes already fixed
before any endpoint exists, so their first real usage imports the shared type
instead of re-deriving it. No domain entity types yet (User, Ride, ...): none
of them exist in `packages/db` either (CR-004's "zero domain tables by
design"); the first domain type lands with its first table, starting CR-011.
Wired into a real consumer in this same task: `apps/api`'s error handler
(`src/plugins/error-handler.ts`) now imports `ProblemDetails` from `types`
(`import type` — fully erased at compile time, confirmed by inspecting
`dist/plugins/error-handler.js` after build, so there is no runtime module
resolution question for this package at all) instead of declaring its own
copy. Re-smoke-tested live after the change: `/health` (200) and an unknown
route (404, correct `application/problem+json` envelope) both still correct
against the compiled `dist/server.js`.

**`packages/ui`**: intentionally empty (`export {}`), same "tooling first,
content when there's a real consumer" discipline as `packages/db`'s zero
domain tables. `docs/design.md`'s tokens (CR-063), the Russian formatter
module (CR-064), and the first shared components (CR-065/CR-066) all land
before `apps/web` has a real screen to put them on (CR-011). Deliberately
NOT wired into `apps/web` yet (no `transpilePackages` entry) — that's
untestable against an empty package and belongs with the first real
component.

**`packages/maps-core`**: the `MapProvider` interface plus `LatLng`,
`GeocodeResult`, `RouteRequest`, `RouteResult` — transcribed verbatim from
the contract `.claude/rules/maps.md` already fixed (ADR-010). Zero vendor
imports, zero runtime code (pure `interface`s, fully erased at compile
time) — this package can never have the dist-vs-source runtime-resolution
question `packages/maps-2gis` has (below), by construction.

**`packages/maps-2gis`**: implements `MapProvider` by calling 2GIS's
Geocoder (`catalog.api.2gis.com/3.0/items/geocode`) and Routing
(`routing.api.2gis.com/routing/7.0.0/global`) REST APIs directly via the
platform's native `fetch` — no npm SDK dependency at all, which trivially
satisfies "packages/maps-2gis is the only package allowed to import the 2GIS
SDK" (ADR-010) since there is no SDK import anywhere. Every call has an
explicit timeout (`AbortSignal.timeout`, `.claude/rules/resilience.md`) and
failures are normalized into one `MapProviderError` type instead of a raw
`fetch`/driver exception, so a future caller can decide its own fallback
(e.g. "create the ride without geocoded coordinates") rather than this
adapter silently swallowing errors itself. Bounded retries and a circuit
breaker — the rest of what `.claude/rules/maps.md` asks for "at the adapter
implementation level" — are explicitly deferred to CR-049 (the same
cross-cutting utility CR-006 deferred S3's resilience wrapping to), not
implemented ad hoc here. Not wired into any route/composition point in this
task — same "factory exists, no consumer until one is justified" discipline
as the Redis (CR-005) and S3 (CR-006) clients.

Two honest gaps recorded rather than silently accepted (see
`known-issues.md`):

- KI-016: the Geocoder/Routing response field names (`point.lat`/`lon`,
  `full_name`, `distance`/`duration`, route geometry) come from 2GIS's public
  documentation and search results, not a live call — no API key is
  configured in this environment. Parsing is deliberately defensive (falls
  back to the requested waypoints as route geometry if the response doesn't
  carry one), but must be verified against a real account before CR-026/
  CR-028/CR-084 depend on it.
- KI-017: `packages/maps-2gis` (and, retroactively, `packages/db`) export
  `main`/`types`/`exports` pointing at raw `.ts` source, not compiled `dist`
  output. That's fine for `tsx` (dev) and `tsc` (typecheck/build-time type
  resolution) but would fail to resolve at runtime under plain `node` once a
  compiled Node consumer actually imports one of these packages' real
  runtime code (their factory functions are not type-only, unlike
  `packages/types`/`packages/maps-core`). Neither package has a real runtime
  consumer yet, so this has never actually been exercised; must be fixed
  (declaration-based `dist` exports) before either is wired into `apps/api`'s
  compiled output for real.

Files: `packages/config/**` (new: `package.json`, `tsconfig/node-library.json`,
`eslint/node-library.js`, `eslint.config.mjs`); `packages/types/**` (new);
`packages/ui/**` (new); `packages/maps-core/**` (new); `packages/maps-2gis/**`
(new); `apps/api/package.json` (`types` devDependency),
`apps/api/src/plugins/error-handler.ts` (imports `ProblemDetails` from
`types`); `docs/tasks.md` (CR-007 checked off); `.claude/context/
{architecture-map,project-state,known-issues,current-task}.md` (KI-016,
KI-017).
Dependencies: none new at the root; each new package declares its own
(`config`/`maps-core`/`types` via `workspace:*`, `@types/node`, `eslint`,
`typescript-eslint`, `typescript` — all already-approved dev tooling, no new
runtime dependency added anywhere).
Decisions: none new at the ADR level — this operationalizes ADR-009/ADR-010/
ADR-011, it doesn't change them.
Follow-up: CR-008 (Configure Vitest/Playwright) is next. CR-063 is the first
real consumer of `packages/ui`; CR-026/CR-028/CR-084 are the first real
consumers of `packages/maps-2gis` and should close KI-016/KI-017 when they
land (or sooner, if a live 2GIS credential becomes available).

## 2026-09-12 — CR-008 — Configure Vitest/Playwright

Summary: wired the test runners the fixed stack already commits to
(`.claude/CLAUDE.md`: "Tests: Vitest + Playwright") into the workspace
members that already have real logic worth testing — same "tooling first,
real content only where there's a justified consumer" discipline as
CR-004..CR-007. Root `turbo.json`/`package.json` already declared
`test`/`test:e2e` tasks since CR-001; this is what makes them do something.

`apps/api`: Vitest, 5 tests driving `buildApp()` through Fastify's
`.inject()` — no real port bound, matching `app.ts`'s own CR-003 comment
anticipating exactly this. Covers `GET /health` (200), an unmatched route
(404, RFC 9457 envelope), a Zod validation failure on an ad hoc test-only
route (400 with `errors[]`), an unexpected thrown error (500, confirmed no
leaked connection string/stack trace in the body), and a below-500 thrown
error passed through with its own status (403). Also a small, deliberate
`app.ts` tweak: `NODE_ENV=test` now gets `logger.level: 'silent'` with no
`pino-pretty` transport (previously only `production` skipped the
transport), since `buildApp()` is called once per test case and a
pretty-printer worker thread per instance is both noisy and slower than
needed — everything else about `buildApp()`'s signature is unchanged.

`packages/maps-2gis`: Vitest, 11 unit tests against `create2GisMapProvider`
with `global.fetch` mocked (`vi.stubGlobal`) — no live 2GIS credential is
available in this environment (KI-016 stays open), so these verify this
adapter's own parsing/fallback/normalization logic against constructed
fixture responses, not 2GIS's actual response shape. Covers: geocode
parsing (including dropping items with no `point`), empty results,
`reverseGeocode` first-result/null, `getRoute` for both response shapes
(`RoutingResponseItem[]` and `{ result: [...] }`), the documented fallback
to the requested waypoints when a route response carries no geometry, a
route response with no usable item throwing `MapProviderError`, and three
failure-mode normalizations required by `.claude/rules/resilience.md`
(non-2xx status, timeout, unparseable JSON body) all becoming one
`MapProviderError` type rather than a raw `fetch`/driver exception.

`apps/web`: Vitest (jsdom + `@testing-library/react` + `@vitejs/plugin-react`)
with one smoke test on the CR-002 placeholder home page (heading + subtitle
render). Playwright wired for e2e: `playwright.config.ts` (`webServer: pnpm
dev`, chromium project) + one smoke spec in `e2e/` asserting the same two
strings are visible on a real page load. Browsers installed
(`playwright install chromium --with-deps`) and the spec run and passed live
against a real `next dev` server in this session — not just typechecked.

`packages/config` gained a third shared fragment, `vitest/node-library.js`
(plain JS returning a plain config object — deliberately not
`defineConfig(...)` + TypeScript, so this package doesn't need its own
`vitest`/`vite` install just to type one object literal), which `apps/api`
and `packages/maps-2gis` both extend via `mergeConfig`-free
`defineConfig(nodeLibraryVitestConfig())` in their own `vitest.config.ts`.
`apps/web` is NOT built on this fragment (jsdom + a React plugin is a
different shape entirely) and has its own config.

A real bug was found and fixed along the way, not worked around: Vite 8's
default `vite:oxc` transform plugin (used by Vitest 5, only exercised once
`packages/maps-2gis` got a `vitest.config.ts`) resolves a _chained_
`extends` in a tsconfig relative to the original consuming file's directory
instead of each intermediate fragment's own directory — unlike `tsc`, which
resolves each hop correctly and was never affected (CR-007 shipped this
exact chain — consumer → `packages/config/tsconfig/node-library.json` →
`tsconfig.base.json` — and `turbo typecheck` has been green on it the whole
time). Recorded and fixed as KI-018, resolved in the same session:
`packages/config/tsconfig/node-library.json` no longer extends
`tsconfig.base.json` itself; `packages/types`, `packages/maps-core`, and
`packages/maps-2gis` each now extend both directly as a TS 5+ array
(`"extends": ["../../tsconfig.base.json", "config/tsconfig/node-library.json"]`),
so no hop is ever chained through an intermediate file. Verified `turbo
build`/`typecheck` stayed green for all three afterward (they were never
broken — only Vitest's transform was).

`packages/db`, `packages/types`, `packages/ui`, `packages/maps-core`, and
`packages/config` itself intentionally got no `test` script: zero domain
tables / pure interfaces / intentionally empty / no logic of its own to
test. `turbo test` silently skips a package with no `test` script — that is
the correct, by-design outcome here, not an oversight.

Full validation: `turbo run test lint typecheck build --force` — 24/24 tasks
green across all 8 workspace members (17 tests total: 5 api + 11 maps-2gis +
1 web, all passing); `pnpm format:check` clean; `pnpm lint:root` clean;
Playwright's e2e spec run and passed live. CI (`.github/workflows/ci.yml`)
already had a `Test` step (`pnpm test`) since CR-001 — it will now actually
execute the three Vitest suites; a Playwright job was deliberately NOT added
to CI in this task (KI-007 already names that CR-080's job — no MinIO
service or migration step in CI yet either).
Files: `packages/config/vitest/node-library.js` (new), `packages/config/
package.json` (exports entry); `apps/api/vitest.config.ts`,
`apps/api/src/app.test.ts` (new), `apps/api/src/app.ts` (logger tweak for
`NODE_ENV=test`), `apps/api/package.json` (`test` script + `vitest`/`vite`/
`config` devDependencies); `packages/maps-2gis/vitest.config.ts`,
`packages/maps-2gis/src/provider.test.ts` (new), `packages/maps-2gis/
package.json` (`test` script + `vitest`/`vite` devDependencies);
`apps/web/vitest.config.mts`, `apps/web/vitest.setup.ts`,
`apps/web/src/app/page.test.tsx`, `apps/web/playwright.config.ts`,
`apps/web/e2e/home.spec.ts` (new), `apps/web/package.json` (`test`/
`test:e2e` scripts + six new devDependencies); `packages/{types,maps-core,
maps-2gis}/tsconfig.json` (array `extends`, KI-018 fix); `packages/config/
tsconfig/node-library.json` (dropped its own `extends`, KI-018 fix);
`docs/tasks.md` (CR-008 checked off); `.claude/context/{project-state,
architecture-map,known-issues,current-task}.md` (KI-018 added/resolved).
Dependencies: `vitest@^5.0.0`, `vite@^8.0.0` (apps/api, packages/maps-2gis,
apps/web); `@vitejs/plugin-react@^6.1.1`, `jsdom@^30.0.1`,
`@testing-library/react@^16.3.3`, `@testing-library/jest-dom@^7.0.1`,
`@playwright/test@^1.63.0` (apps/web only). All dev-only, no new runtime
dependency anywhere.
Decisions: none new at the ADR level — the fixed stack already committed to
Vitest + Playwright; this operationalizes that, it doesn't decide it.
Follow-up: CR-009 (Configure Docker Compose) is next. CR-080 wires
Playwright (and MinIO/migrations) into CI. KI-016 (2GIS response shapes
unverified against a live account) is unaffected by this task's unit
tests — they verify this adapter's own logic, not 2GIS's real API.

## 2026-09-13 — CR-009 — Configure Docker Compose

`docker-compose.yml` predated CR-001 (it shipped with the initial harness scaffold) and
had only been touched once since, by CR-071/CR-072's port-binding/secrets hardening —
it had never itself been treated as its own completed, verified task, and two real bugs
against it had sat open since the 2026-09-11 pre-foundation audit (KI-004, KI-005).
CR-009 closes those out rather than leaving them for whichever later CR happened to touch
the file next.

Fixed KI-004 (MinIO healthcheck): the healthcheck shelled out to `curl -f http://
localhost:9000/minio/health/live`, but the MinIO server image does not bundle `curl`.
Replaced with `mc ready local` — verified live against MinIO's own official
`docker-compose.yaml` example (`minio/minio` GitHub repo,
`docs/orchestration/docker-compose/docker-compose.yaml`), which uses exactly this
healthcheck with no separate `mc` container, confirming `mc` is bundled in the server
image itself.

Fixed KI-005 (unpinned MinIO image): `minio/minio:latest` let dev/CI/server drift apart
silently. Pinned to `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` — switching the
registry too, not just adding a tag to the Docker Hub image, because MinIO's current
official docs (`docs/docker/README.md`, checked live) reference `quay.io/minio/minio`
exclusively now. Verified the chosen tag actually resolves via quay.io's registry v2
manifest API (HTTP 200) before using it: GitHub's releases API reports a newer tag
(`RELEASE.2025-10-15T17-29-55Z`) as latest, but that tag returned 404 against quay's
registry (not mirrored there yet) — pinned the newest tag that is actually resolvable
instead of the newest tag that merely exists upstream.

Added a Redis healthcheck (`redis-cli ping`) — it had none at all, unlike postgres/minio.
Deliberately did NOT touch KI-003's Redis password/persistence/AOF gap here; that stays
its own decision, deferred to CR-077.

Added `pnpm infra:up`/`infra:down` root scripts (`docker compose up -d`/`docker compose
down`) so the compose file is operable the same way as `pnpm test`/`pnpm build`, and
updated `README.md`'s "Local infrastructure" section to mention them alongside the
existing raw `docker compose up -d` (kept, for anyone without the repo's scripts
memorized).

Validation: `docker compose -f docker-compose.yml config` parses/resolves cleanly after
every change. Docker's daemon is still unreachable in this environment — same standing
constraint as CR-004/CR-005/CR-006 (`docker info` fails; `docker compose up -d` fails
with "Cannot connect to the Docker daemon"; see `docker-desktop-unavailable` in Claude's
project memory) — so this task could not live-boot the services or confirm the
healthchecks actually turn `healthy`, only that the file itself is now correct and
parses. Recorded honestly as KI-019 rather than silently assumed working. `turbo run
lint typecheck build --force` — 21/21 tasks green (this task touched no workspace
package; confirms nothing broke). `pnpm format:check`/`lint:root` clean.

No database migration, no API change, no new runtime dependency (root `package.json`
scripts only, no new package).

Files: `docker-compose.yml` (MinIO image + healthcheck, Redis healthcheck + a comment
explaining the registry/healthcheck change), `package.json` (root — `infra:up`/
`infra:down` scripts), `README.md` (mentions the new scripts), `.claude/context/
known-issues.md` (KI-004/KI-005 resolved as KI-R07/KI-R08, KI-019 added for the
still-unverified live boot), `docs/tasks.md` (CR-009 checked off), `.claude/context/
{project-state,current-task}.md`.

Decisions: none new at the ADR level — this operationalizes/corrects the existing
compose file, it doesn't change the local-infra architecture (still Postgres + Redis +
MinIO, still loopback-only, still "local development infrastructure only" per the file's
own top comment).

Known limitations: KI-019 (this compose file has never been booted live in this
environment — next session with a working Docker daemon should run `docker compose up
-d` + `docker compose ps` and confirm all three reach `healthy`, not just `running`,
before CR-050/CR-058/CR-027/CR-086 rely on it for their own live verification). KI-003
(Redis auth/persistence/healthcheck-of-substance) and KI-004's sibling MinIO concerns
beyond the healthcheck itself stay open, unchanged, deferred to CR-077/CR-082 as before.

Follow-up: CR-010 (Configure CI + Git hooks) is next.

## 2026-09-13 — CR-010 — Configure CI + Git hooks

Like `docker-compose.yml` (CR-009), `.github/workflows/ci.yml` and the Husky/lint-staged
setup shipped with the initial harness scaffold and were hardened once (CR-067: root
lint actually running in CI, restricted token) but never themselves closed out as a
task. Exactly one real bug was already tracked against this area — KI-012, whose own
"next action" line named this CR by number — so CR-010 closed it rather than leaving it
for whichever later task happened to touch the file next.

Fixed KI-012 (pre-commit ESLint didn't cover workspace files): ESLint's flat config has
no directory cascading — the config file used is chosen by the invoking process's CWD,
not the linted file's location. `turbo lint` runs each workspace's own `lint` script
with CWD inside that package, so it always picked up the right config; lint-staged's
pre-commit `eslint --fix`, though, ran with CWD at the repo root, so it always used the
root config, which deliberately ignores `apps/**`/`packages/**`. Net effect: a staged
file inside any of the 8 workspace members was Prettier-formatted at commit time but
never actually ESLint-checked — a real violation would only surface later, in CI.

Root `package.json`'s `lint-staged` config now has one glob entry per workspace member
(`apps/web/**/*.{ts,tsx,js,jsx}`, `apps/api/**/*...`, one per `packages/*`), each
running `pnpm --filter <name> exec eslint --fix --no-warn-ignored` instead of a single
blanket rule. `pnpm --filter <name> exec` sets CWD to that package's own directory,
which is what makes flat config resolve its `eslint.config.mjs` correctly; this works
because lint-staged 15.5.2 passes **absolute** file paths to task commands by default
(confirmed against its own docs), so the command's CWD can differ from the paths'
origin without breaking anything. The old generic root-level entry was removed —
redundant once every workspace has its own scoped entry, and there are zero
non-workspace top-level `.ts`/`.js` files in this repo to lose coverage on.

Considered lint-staged's own documented "one `.lintstagedrc` per package" monorepo
pattern and rejected it: lint-staged does not merge configs across directories, so each
of the 8 new per-package config files would need its own duplicated copy of the
Prettier rule too — more files, more duplication, no behavioral benefit here since
nothing package-specific is needed beyond directory scoping. A single root config with
8 explicit glob entries stays one source of truth.

Verified live, not just reasoned about: staged a real file in `apps/web` with an
intentional unused-variable violation, then ran the exact command `.husky/pre-commit`
invokes (`pnpm exec lint-staged`). Before the fix (`eslint --fix` from repo root against
the same absolute path): zero output — the file was silently skipped, ignored by the
root config's `apps/**` pattern. After the fix: `apps/web`'s own Next.js-derived
ruleset correctly reported the violation — proof the workspace-specific config (which
carries Next/React rules the root config doesn't have at all) is now genuinely applied
to staged files, not just that some eslint process ran. Test file reverted immediately
after; confirmed clean via `git diff`/`git status`.

Two `eslint.config.mjs` files (root, `apps/web`) had comments explicitly documenting
the old bypass behavior as current fact — updated both rather than leaving a stale
comment next to code it no longer accurately describes.

Reviewed the rest of the CI/hooks setup rather than touching it blindly: `ci.yml`'s
shape (checkout → pnpm/node setup → install → format check → lint:root → lint →
typecheck → test → build, with postgres+redis services) is sound and was left
unchanged. Confirmed `core.hooksPath` is correctly wired to `.husky/_` in this checkout
(the `prepare` script's job). Deliberately did NOT take on KI-007 (MinIO service /
migration step / Playwright job in CI) — that issue's own next action names CR-080, a
separate task, and folding it in here would have been an unrequested scope expansion.
Also deliberately did NOT add a commit-msg hook/commitlint: `.claude/rules/git.md`'s
commit-style section says "Preferred", not enforced, and adding enforcement tooling is
a decision this task wasn't asked to make.

Validation: `turbo run lint typecheck build --force` — 21/21 tasks green; `turbo run
test --force` — all passing (5 api + 1 web unit tests; unaffected by this task, run to
confirm nothing broke); `pnpm format:check`/`lint:root` clean.

No database migration, no API change, no new runtime or dev dependency (existing
`lint-staged`/`husky`/`eslint` versions, reconfigured only).

Files: `package.json` (root — `lint-staged` config rewritten), `eslint.config.mjs`
(root — comment updated), `apps/web/eslint.config.mjs` (comment updated),
`.claude/context/known-issues.md` (KI-012 resolved as KI-R09), `docs/tasks.md` (CR-010
checked off), `.claude/context/{project-state,current-task}.md`.

Decisions: none new at the ADR level — this closes a tooling gap that was already
diagnosed and assigned to this CR; it doesn't change CI/git-hooks architecture.

Known limitations: KI-007 (CI still can't test uploads or run e2e — MinIO service,
migration step, Playwright job all still absent from `ci.yml`) is unchanged, still
explicitly CR-080's job. KI-019 (docker-compose.yml never booted live in this
environment) is unrelated to and unaffected by this task.

Follow-up: no more Foundation-phase tooling CRs remain unassigned before CR-011 (User
registration) — CR-001..CR-010 are now all done. Design foundations (CR-063/CR-064) are
the actual blocker for CR-011 per `docs/design.md`.

## 2026-09-13 — CR-063 — Design tokens in `packages/ui`

`docs/design.md` §14 names CR-063/CR-064 as hard prerequisites for CR-011 — the first
real screen. CR-063 replaces `apps/web`'s placeholder shadcn neutral theme with the real
light/dark palette, typography and radius tokens from `docs/design.md` §3-§5/§12, sourced
from `packages/ui` as the spec requires, not from `apps/web` itself.

Added `packages/ui/src/tokens.css`: the full light + dark palette (`bg`, `bg-raised`,
`text`, `text-secondary`, `text-muted`, `primary`, `on-primary`, `success`, `warning`,
`danger`, `on-danger`, `info`, `border`, `border-input`, plus the data-viz
`chart-secondary` clay tone) as `:root`/`.dark` CSS custom properties, mapped into
Tailwind v4's `@theme inline` so feature code gets `bg-bg-raised`/`text-text-secondary`/
`border-border-input` utility classes instead of a hex literal. Dark theme lands with
this task, not deferred, per §3. Exposed via `packages/ui`'s `exports` field
(`"./tokens.css": "./src/tokens.css"`) and consumed from `apps/web/src/app/globals.css`
via `@import 'ui/tokens.css'` — `apps/web` now depends on `ui` as a workspace package for
the first time.

Radius: base `--radius` changed from the shadcn default (0.625rem/10px) to 0.5rem/8px so
the existing `radius-sm/md/lg/xl` derivation (already in the scaffold) lands on §5's 8px
default / 12px large-surface values without inventing a new derivation scheme.

Typography (§4): did **not** add a custom Tailwind font-size scale — checked Tailwind
v4's default `text-xs`..`text-4xl` scale against §4's 12/14/16/18/20/24/30/36px spec
first and it already matches exactly, so introducing parallel tokens would only
duplicate it. Same check for spacing (§5): Tailwind's default spacing scale is 4px
multiples, already matching §5's 4/8/12/16/24/32/48/64 scale — no override added. Golos
Text (UI text) and IBM Plex Mono (tabular/data text) wired via `next/font/google` in
`apps/web/src/app/layout.tsx`, binding to `--font-golos`/`--font-plex-mono` CSS
variables that `tokens.css`'s `--font-sans`/`--font-mono` theme keys read via a nested
`var(..., fallback)` — verified Cyrillic coverage two ways before adopting either face
(§4's explicit requirement): (1) checked the installed `next@15.5.25`'s bundled Google
Fonts metadata directly — both faces list `cyrillic`/`cyrillic-ext` subsets; (2) live
render via a temporary `next dev` server + the browser-automation skill — screenshot and
`getComputedStyle` both confirmed Golos Text actually applied and rendering the
placeholder page's Russian text correctly, in both light and dark (`.dark` class toggled
live; computed `background-color`/`color` matched the token hex values exactly in both
modes).

Focus ring (§12 — "visible focus ring on every interactive element, 2px `primary`, 2px
offset"): added as a global `:focus-visible` base style now rather than left for CR-045,
since CR-045 is explicitly an audit of existing usage, not the place new tokens are
introduced.

Elevation (§5): added one `--shadow-overlay` theme token (soft, low shadow) for
popover/modal/sheet use; resting cards get no shadow token at all — a hairline border via
the existing `@apply border-border` base rule is the whole treatment, per §5's "at most
two levels" rule.

Lint rule (§14 — "reject raw hex colors in apps/web"): added to `apps/web/eslint.config.mjs`
as a scoped `no-restricted-syntax` rule matching a hex-color pattern in string literals and
template elements — deliberately JS/TS-only (ESLint doesn't parse `packages/ui/src/tokens.css`
under this ruleset, so it can't flag its own source of truth) and deliberately scoped to
`apps/web` only, matching §14's exact wording rather than added to the shared
`packages/config` ESLint factory. Verified live: staged a real `'#123abc'` string literal
in `apps/web/src/app/page.tsx`, confirmed `pnpm --filter web exec eslint` reported it,
then reverted the test edit (`git diff`/`git status` confirmed clean afterward, along with
the genuine `text-muted-foreground` → `text-text-secondary` fix that page needed anyway
now that the old shadcn token no longer exists).

Also reverted, before starting this task: an unrelated, undocumented change to
`.vscode/extensions.json` (removed the `ms-playwright.playwright` recommendation) found
sitting in the working tree from before this session, with no changelog entry
attributing it to CR-009 or CR-010 and no relation to either task's actual scope —
confirmed with the user rather than guessed at, then discarded.

Also committed, at the start of this session, the CR-009/CR-010 work that had been
completed but not yet committed (`0e54dc2`) — both bundled into one commit rather than
split, since `current-task.md`/`project-state.md` are overwritten snapshots and the
intermediate "CR-009 done, CR-010 not yet" state no longer exists in the working tree to
commit separately without fabricating it.

Validation: `turbo run lint typecheck build test --force` — 24/24 tasks green (`apps/web`
gained a `test` task's worth of coverage from its existing Vitest suite, now actually
exercised against the new tokens — the placeholder page's smoke test still passes
unmodified, since it asserts on text content, not classes). `apps/web`'s Playwright e2e
suite (`home.spec.ts`) passes against a real `next build`. `pnpm format:check`/
`lint:root` clean. One stale-`.next` gotcha hit and resolved along the way: an interim
`next dev` session (used for the live font/token render check) left `apps/web/.next` in a
dev-mode state missing the route type-stub files `web:typecheck` expects
(`.next/types/app/*.ts`) — `next build` (production) regenerates these upfront; `next
dev` does not for unvisited routes. Deleting `apps/web/.next` before the final validation
pass resolved it; not a token/tooling bug, just an artifact of manually running the dev
server mid-task.

No database migration, no API route change. New dependency: `apps/web` now depends on
`ui` (`workspace:*`) for the first time — its first real cross-package dependency inside
`apps/web` (`packages/types`'s only current consumer is `apps/api`).

Files: `packages/ui/src/tokens.css` (new), `packages/ui/package.json` (`exports` entry),
`packages/ui/src/index.ts` (comment updated), `apps/web/package.json` (`ui` dependency),
`apps/web/src/app/globals.css` (rewritten), `apps/web/src/app/layout.tsx` (next/font
wiring), `apps/web/src/app/page.tsx` (token class fix), `apps/web/eslint.config.mjs`
(hex-color rule), `pnpm-lock.yaml`, `.claude/context/known-issues.md` (KI-020 added),
`docs/tasks.md` (CR-063 checked off), `.claude/context/{project-state,current-task}.md`.

Decisions: none new at the ADR level — this implements `docs/design.md`'s already-decided
token spec; no palette/typography value was changed from what §3/§4 already specifies.

Known limitations: KI-020 (new) — `apps/web/components.json`'s shadcn alias defaults to
generating vendored components inside `apps/web`, not `packages/ui`, which
`docs/design.md` §9/§14 requires; must be resolved before CR-065/CR-066 vendors the first
real component, not after. Everything else from CR-010's known-limitations list is
unchanged.

Follow-up: CR-064 (Russian formatters + UI terminology mapping) is next — the other
named prerequisite for CR-011, and the last remaining item before `docs/design.md`'s
component work (CR-065/CR-066) and the first real screen (CR-011) can start.

## 2026-09-13 — CR-064 — Russian formatters + UI terminology mapping

Summary: Added `packages/ui/src/format.ts` and `packages/ui/src/terminology.ts` — the
second (and last) `docs/design.md`-mandated prerequisite for CR-011, after CR-063's
tokens. `format.ts` covers every row of §7's table (distance, elevation, speed/pace,
duration, date, time, price, participants): comma decimal separator, NBSP thousands
grouping, value+unit always NBSP-joined, and a missing/`null`/`undefined` numeric input
renders as an em dash rather than `0` (`.claude/rules/frontend.md`/§6's "no elevation
data" vs. "flat route" distinction) — handled once here so CR-065's `MetricTile` and
friends get it for free. `terminology.ts` covers §13: ride status (7 values, with tone)
and bicycle type (4 values) use enum keys copied verbatim from `docs/product.md`'s
already-fixed lifecycle/bicycle-type strings; services (10 values) and registration
action/state labels (4 values) had no authoritative enum to copy from (`packages/db` has
zero domain tables, `docs/product.md` §Services is free-text English only) so their
snake_case keys are provisional — flagged in-code and as KI-021.

`packages/ui` got its first real Vitest suite (`node` environment, same
`config/vitest/node-library` fragment `packages/maps-2gis` uses — no DOM needed for pure
formatting/lookup logic): 31 tests, one per documented example plus a missing-value case
per formatter. `packages/ui/src/index.ts` re-exports both modules (its first real exports
— was `export {}` since CR-007).

No database migration, no API route change, no new runtime dependency (`vite`/`vitest`
were already resolvable from the existing `maps-2gis`/`apps/web` dependency tree, so
`pnpm install` added zero new packages — just new `packages/ui` devDependency entries in
the lockfile).

Files: `packages/ui/src/{format,terminology}.ts` (new), `packages/ui/src/{format,
terminology}.test.ts` (new), `packages/ui/src/index.ts` (first real exports),
`packages/ui/vitest.config.ts` (new), `packages/ui/package.json` (`test` script,
`vitest`/`vite`/`config` devDependencies), `pnpm-lock.yaml`,
`.claude/context/known-issues.md` (KI-021 added), `docs/tasks.md` (CR-064 checked off),
`.claude/context/{project-state,current-task}.md`.

Decisions: none new at the ADR level — this implements `docs/design.md` §7/§13, already
decided; no formatting rule or Russian label was changed from what those sections specify.
The one real judgment call (documented in-code, not an ADR): `formatDuration` omits a
zero-minutes remainder (`2 ч`, not `2 ч 0 мин`) — not spelled out by a design.md example,
decided by analogy to the missing-value em-dash rule ("don't show a zero that isn't
information").

Known limitations: KI-021 (new) — `RideService`/registration-state keys in
`terminology.ts` are provisional pending the real `RideService` DB enum (not yet
scheduled with a CR number); ride status and bicycle type are unaffected (already sourced
from `docs/product.md`). The ride-start timezone-hint decoration mentioned in §7 (an
explicit city/timezone label when it differs from the viewer's) is deliberately deferred,
not implemented here — it needs a viewer-timezone source and a place name that don't
exist as data yet; basic 24-hour time formatting against an explicit IANA zone (§7's Time
row itself) is implemented and tested. Everything else from CR-063's known-limitations
list is unchanged.

Follow-up: CR-065 (Metric presentation components: `MetricTile`, `MetricRow`,
`StatusBadge`, `DifficultyScale`, `docs/design.md` §6) is next — the first consumer of
both this task's formatters and CR-063's tokens, and it must also resolve KI-020 (shadcn
CLI's component-vendoring target) before vendoring its first component.

## 2026-09-13 — CR-065 — Metric presentation components

Summary: Added `packages/ui`'s first four shared components — `MetricTile`,
`MetricRow`, `StatusBadge`, `DifficultyScale` (`docs/design.md` §6, §9's shared
component inventory) — on top of CR-063's tokens and CR-064's formatters/terminology.
`MetricTile` renders a label/value/unit triple (unit inline, 0.6em, never bold), backed
by new additive `*Parts` helpers in `format.ts` (`formatDistanceParts`, etc.) that
split a formatter's output into `{ value, unit }` instead of one NBSP-joined string —
the existing joined `format*` functions are now implemented in terms of these rather
than duplicated, and their original 31 tests were re-run unchanged before anything new
was added, to confirm the refactor was behavior-preserving. `MetricRow` lays out its
children as a 2-column grid on mobile and a flex row from `md` up. `StatusBadge` renders
a `{label, tone}` pair from `terminology.ts`; per §1's "one exception," `danger` is the
only tone rendered as a solid fill, every other tone (including a new `neutral` case) is
a low-weight tinted/outlined chip — deliberately self-contained rather than composed
from a separate generic `Badge` primitive, to avoid pulling KI-020's still-open
shadcn-vendoring question into this task. `DifficultyScale` adds the five difficulty
words (§6) to `terminology.ts` and renders a 1-5 segment scale plus the word, with an
`sr-only` numeric qualifier for screen readers. `packages/ui` gained its first
jsdom + Testing Library Vitest setup (54 tests across 6 files, explicit
`afterEach(cleanup)` since this config doesn't use Vitest's `globals: true`) and a
shared `cn` helper (`clsx` + `tailwind-merge`, its own copy — `packages/ui` cannot
depend on `apps/web`).

A live visual check (a temporary component showcase rendered in `apps/web`, screenshot
light + dark via the browser-automation skill, both reverted afterward) caught a real,
previously-invisible bug: Tailwind v4's automatic content detection never scanned
`packages/ui` at all — every one of its own Tailwind classes (`rounded-full`,
`bg-bg-raised`, the value/unit `gap`, `StatusBadge`'s tint classes) silently generated
no CSS, present in the DOM's `class` attribute but with zero visual effect. Fixed
permanently (not part of the reverted showcase) with an `@source` directive in
`apps/web/src/app/globals.css` pointing at `packages/ui/src` — recorded as KI-R10,
resolved same-session. This is exactly why `docs/design.md`'s prerequisite ordering
insists design-foundation work be verified live, not just unit-tested: a jsdom test has
no layout/paint step and could never have caught this.

No database migration, no API route change. New dependencies: `packages/ui` now depends
on `clsx`/`tailwind-merge` (matching `apps/web`'s own versions) and gained
`@testing-library/react`/`@testing-library/jest-dom`/`@vitejs/plugin-react`/`jsdom`/
`react-dom` as devDependencies (plus `react-dom` as a new peerDependency, alongside the
existing `react` one); the `config` workspace devDependency CR-064 added (for the
now-removed `node`-environment Vitest fragment) was dropped as unused.

Files: `packages/ui/src/components/{MetricTile,MetricRow,StatusBadge,
DifficultyScale}.tsx` (new) + colocated `.test.tsx` each, `packages/ui/src/lib/cn.ts`
(new), `packages/ui/src/format.ts` (additive `*Parts` helpers), `packages/ui/src/
terminology.ts` (`DifficultyLevel`/`DIFFICULTY_LEVEL_TERMS`), `packages/ui/src/index.ts`
(re-exports), `packages/ui/vitest.config.ts`/`vitest.setup.ts` (jsdom + React, replacing
CR-064's `node`-environment fragment), `packages/ui/tsconfig.json` (includes
`vitest.setup.ts` so `tsc --noEmit` sees jest-dom's matcher types), `packages/ui/
eslint.config.mjs` (hex-literal restriction, mirroring `apps/web`'s), `packages/ui/
package.json`, `apps/web/src/app/globals.css` (`@source` fix), `pnpm-lock.yaml`,
`.claude/context/known-issues.md` (KI-R10 added, KI-020 updated), `docs/tasks.md`
(CR-065 checked off), `.claude/context/{project-state,architecture-map,
current-task}.md`.

Decisions: none new at the ADR level. Two judgment calls, both documented in-code
rather than as ADRs (component-level, not architectural): `StatusBadge`'s tone-styling
scheme (danger = solid fill, every other tone = tinted chip, `neutral` = plain
bordered surface) is inferred from `tokens.css` only defining `--on-danger`/
`--on-primary` foregrounds and from §1's explicit "one exception" framing, not from an
exact CSS spec in `docs/design.md`; `MetricRow`'s grid/flex breakpoint cutover uses
`md` (768px) by analogy to §11's breakpoint table, since §6 itself names no exact
pixel value.

Known limitations: KI-R10 (new, resolved) — see above. KI-020 (shadcn CLI's vendoring
target) stays open, confirmed untouched by this task. KI-021 (provisional
service/registration keys) unaffected. Everything else from CR-064's known-limitations
list is unchanged.

Follow-up: CR-066 (Shared state primitives — `Skeleton`, `EmptyState`, `ErrorState` +
the degraded-state pattern used by CR-052, `docs/design.md` §10) is next — the last
Design-foundations prerequisite before CR-011.

## 2026-09-13 — CR-066 — Shared state primitives

Summary: Added `packages/ui`'s last three Design-foundations components —
`Skeleton`, `EmptyState`, `ErrorState` (`docs/design.md` §10) — the final prerequisite
before CR-011's first real screen. `Skeleton` is a decorative (`aria-hidden`) shimmer
block, animation gated behind `motion-safe:animate-pulse` so `prefers-reduced-motion`
users get a static placeholder instead (§12); it is a real shadcn-registry primitive
(unlike any of CR-065's four components — see KI-020), hand-vendored directly against
`packages/ui`'s own tokens/`cn` rather than through the shadcn CLI, since the upstream
component is one `div`/two classes and `packages/ui` isn't a CLI-detectable app target
— recorded as a scoped, not general, resolution of KI-020. `EmptyState` requires a
caller-supplied `title` (never defaults to a bare "Нет данных" per §10) plus optional
`description`/`action`/`icon`, announced via `role="status"`. `ErrorState` covers both
of §10's remaining states with one component via `tone`/`variant` instead of a second
one: `tone="danger"` + `variant="block"` (default, `role="alert"`) is the plain Error
state; `tone="warning"` + `variant="inline"` (`role="status"`) is the Degraded state
from CR-052/`.claude/rules/resilience.md` — a failing dependency notice that sits next
to still-usable content instead of blanking the page. `message` is always
caller-supplied (never a raw server string, `.claude/rules/backend.md`); the retry
button's default label routes through a new `terminology.ts` export (`UI_TERMS.retry`
= "Повторить") rather than a literal in the component, per
`.claude/rules/frontend.md`'s "no hard-coded user-visible Russian strings in a
component" rule.

A live visual check (temporary showcase in `apps/web`, `browser-automation` skill,
reverted afterward) caught a real bug beyond what jsdom could: `ErrorState` defines its
own `onClick` (the retry button), so a Next.js App Router Server Component cannot pass
its `onRetry` prop through it without `'use client'` on the component itself — the
build failed with "Event handlers cannot be passed to Client Component props" until
this was added. `Skeleton`/`EmptyState` needed no directive (they wire no handlers of
their own). Confirmed live in both themes: the pulse animation's computed
`animation-name` is `pulse` normally and `none` under emulated
`prefers-reduced-motion: reduce`; 0 console errors, 0 failed requests on the real page
loads.

No database migration, no API route change, no new runtime dependency.

Files: `packages/ui/src/components/{Skeleton,EmptyState,ErrorState}.tsx` (new) +
colocated `.test.tsx` each, `packages/ui/src/terminology.ts` (`UI_TERMS` added) +
`terminology.test.ts`, `packages/ui/src/index.ts` (re-exports),
`.claude/context/known-issues.md` (KI-020 updated, scoped resolution for `Skeleton`),
`docs/tasks.md` (CR-066 checked off), `.claude/context/{project-state,
current-task}.md`.

Decisions: none new at the ADR level. One judgment call, documented in-code rather
than as an ADR (component-level): `ErrorState` implements both the Error and Degraded
states from a single component via `tone`/`variant` rather than a second
`DegradedNotice` component, since `docs/design.md` §9's shared-component inventory
lists no separate degraded-state primitive and the two states share the same
plain-language-message-plus-optional-retry shape — only urgency (`role`) and visual
weight (`block` vs `inline`) differ.

Known limitations: KI-020 partially addressed — `Skeleton`'s hand-vendor resolves it
for this component only; the general shadcn-CLI-targeting question stays open for the
first structurally complex primitive (`Dialog`/`Select`/`DatePicker`/...) a future CR
vendors. Everything else from CR-065's known-limitations list is unchanged.

Follow-up: Design-foundations phase (CR-063..CR-066) is now complete. CR-011 (User
registration) is next — the first real screen and first consumer of every token/
formatter/component this phase built.

## 2026-09-13 — CR-011 — User registration

Summary: first real screen, first `packages/db` domain tables, first `apps/api` capability
module, and first consumer of every `packages/ui`/`packages/types` piece CR-063..CR-066
built. Implements `POST /v1/auth/register` and `POST /v1/auth/verify-email` (full
verification cycle; real email delivery stays out of scope pending ADR-007) plus the
`/register` web screen. Login/session is CR-012, not this ticket.

`packages/db`: `users` (`id`, `email` unique/lowercased, `passwordHash`, `emailVerified`
default `false`, `createdAt`/`updatedAt` `timestamptz` per ADR-012) and
`email_verification_tokens` (`id`, `userId` FK cascade-delete, `tokenHash` unique — the
raw token is never persisted, same pattern as ADR-013's `Session.tokenHash` — `expiresAt`
24h, `usedAt` nullable/single-use, `createdAt`). Migration generated via
`drizzle-kit generate` and live-applied against a local scratch Postgres database
(`coffee_ride_dev`, Homebrew Postgres 14 — Docker still unreachable in this environment,
KI-019); schema live-verified with `\d users`/`\d email_verification_tokens`.

`packages/types`: `User` (public-safe: no `passwordHash`) and the shared
`registerRequestSchema`/`verifyEmailRequestSchema` Zod contract (`api/auth.ts`) — the
same schema validates on both `apps/api` (server) and `apps/web` (client-side inline
validation), so the two can't drift. Added `zod` as a real dependency of `packages/types`.

`apps/api`: `DATABASE_URL` is now required in `env.ts` (first real DB consumer);
`src/plugins/db.ts` decorates the Fastify instance with a `db` client, mirroring
`redis.ts`/`s3.ts`'s factory shape. First capability module,
`src/modules/auth/` (`.claude/rules/architecture.md`): `password.ts` (Argon2id via the
`argon2` package — user's explicit choice over bcrypt), `tokens.ts` (crypto-random raw
token + its SHA-256 hash for storage), `auth.service.ts` (`registerUser`/`verifyEmail`,
transactional inserts/updates, a unique-violation race guard on top of the pre-check,
domain errors carrying `code`/`statusCode`/`title` that the shared error handler now
prefers over a bare `error.name`), `auth.routes.ts` (thin `FastifyPluginAsyncZod`
handlers — needed for `request.body` to type correctly through the Zod provider chain;
response schemas built from an explicit Zod object, not just the `User` type, so the
serializer strips any unlisted field as a second line of defense against ever leaking
`passwordHash`). `@fastify/rate-limit` registered globally (lenient 100/min default) with
a stricter 5/min/IP tier on both auth routes via per-route `config.rateLimit` — in-memory
store, not Redis (KI-014: Redis unverified in this environment; scope boundary, not an
oversight — see `.claude/context/known-issues.md` KI-022 for what's still interim).
`verificationUrl` (a `/v1/auth/verify-email?token=...` path, not a clickable page — none
exists yet) is present in the register response only outside production. 15 new Vitest
tests (`app.test.ts` updated for the now-required `DATABASE_URL`; new
`auth.routes.test.ts` against a real live Postgres database — register happy path,
production hides `verificationUrl`, duplicate email 409 (incl. case-insensitivity),
validation 400, rate-limit 429, verify-email happy/unknown/already-used/expired).

`packages/ui`: first form primitives — `Button` (variant/`isLoading`, 44px touch target,
visible focus ring), `Input`, `FormField` (clones its child control to wire
`id`/`aria-describedby`/`aria-invalid` — real `<label>`+linked error text per
`.claude/rules/frontend.md`/§12), `Card` — hand-vendored against existing tokens, same
precedent as `Skeleton` (KI-020, updated: these are real shadcn primitives but
structurally trivial, same reasoning). `AUTH_TERMS` added to `terminology.ts` (register
screen's Russian copy — no hard-coded string in the component). 82 `packages/ui` tests
passing (was 54). Fixed a real bug found while writing these: `vitest.setup.ts` never
registered React Testing Library's cleanup (no `test.globals`, so RTL's own auto-cleanup
never self-registers) — every multi-test component file was leaking renders into the next
test's DOM; added an explicit `afterEach(cleanup)`.

`apps/web`: `next.config.ts` gains `rewrites()` (`/api/v1/*` → `API_INTERNAL_URL`, new env
var, single-origin per ADR-013) and a webpack `resolve.extensionAlias` (`.js` → `.ts`/
`.tsx`/`.js`) — `packages/types` is written for `tsc`'s NodeNext resolution (explicit
`.js`-suffixed relative imports pointing at `.ts` files), which webpack doesn't understand
by default; `apps/web` is `types`' first bundler-based consumer. `src/features/auth/
register/` (`.claude/rules/extensibility.md` feature-module shape): `api.ts` (typed
client, `ApiError` carrying the full `ProblemDetails`), `components/RegisterForm.tsx`
(client-side Zod validation, pending state, duplicate-submit guard against a second
Enter-key submit, server-error mapping — `email_already_registered` → field error,
`validation_error` → field errors, anything else → generic message — success state with
the dev-only verification note). `src/app/register/page.tsx` is the route. 8 new tests.

Live check (this session): both servers run against the real scratch Postgres database;
register → duplicate-email (409) → verify-email (200, then already-used 400, then unknown 400) → validation failure (400) all exercised over real HTTP with curl, matching the RFC
9457 envelope and rate-limit headers exactly. `/register` screenshotted via the
browser-automation skill in both themes (dark via the `.dark` class — this app's dark mode
is class-based, not `prefers-color-scheme`, per CR-063), then the full form flow (fill,
submit, success state incl. the dev-only link) driven live in the browser: 0 console
errors, 0 failed requests throughout.

`npx turbo run lint typecheck build test` all green (run separately per task — a combined
`lint typecheck build test` invocation raced `web:typecheck` against `web:build` over the
same `.next` directory and produced a spurious `.next/types` failure; not a real bug, just
an ordering hazard from running them concurrently against one package). `pnpm format:check`
/ `pnpm lint:root` clean.

A real, previously-only-predicted bug was confirmed live and is now blocking (not part of
this ticket's own acceptance criteria, which don't execute compiled output): running
`NODE_ENV=production node dist/server.js` (mirroring CR-003's original smoke test) crashes
immediately — `packages/db` (and, untested but almost certainly, `packages/types`) export
raw TS source via their `package.json`, which plain `node` cannot resolve the way `tsx`/
`tsc` do. See `.claude/context/known-issues.md` KI-017 (updated, now confirmed) — resolving
it is an architecture/tooling decision (dist-based exports + a dev-time build step, or a
bundler for `apps/api`'s own build) that needs its own ADR, not a fix folded into this
feature ticket.

Added `.github/workflows/ci.yml`: a "Run database migrations" step
(`pnpm --filter db db:migrate`) before Format/Lint/Test — CI's `postgres` service starts
empty and the new auth tests need the real schema.

Files: `packages/db/src/schema/{user,email-verification-token,index}.ts`,
`packages/db/migrations/0000_majestic_silver_fox.sql`, `packages/types/src/{domain/user,
api/auth,index}.ts`, `packages/types/package.json` (added `zod`), `apps/api/src/env.ts`,
`apps/api/src/app.ts`, `apps/api/src/plugins/db.ts` (new), `apps/api/src/routes/v1.ts`,
`apps/api/src/modules/auth/` (new: `password.ts`, `tokens.ts`, `auth.service.ts`,
`auth.routes.ts`, `auth.routes.test.ts`), `apps/api/src/app.test.ts`,
`apps/api/src/plugins/error-handler.ts` (title fallback), `apps/api/package.json` (added
`argon2`, `@fastify/rate-limit`, `db`, `drizzle-orm`, moved `types` to dependencies),
`packages/ui/src/components/{Button,Input,FormField,Card}.tsx` + tests,
`packages/ui/src/{index,terminology}.ts`, `packages/ui/vitest.setup.ts`,
`apps/web/next.config.ts`, `apps/web/.env.example`/`.env.example` (`API_INTERNAL_URL`),
`apps/web/package.json` (added `types`), `apps/web/src/features/auth/register/`,
`apps/web/src/app/register/page.tsx`, `.github/workflows/ci.yml`, `docs/{database,api,
tasks}.md`, `.claude/context/known-issues.md` (KI-017 updated, KI-020 updated, KI-022
new).

Decisions: none new at the ADR level. `packages/types` now carries a real runtime
dependency (`zod`) for the first time, not just types — consistent with ADR-011's contract
already being "the two packages share a schema," just not exercised until now.

Known limitations: KI-022 (new) — auth endpoints ship without `@fastify/helmet`/CSRF
(CR-061) or Redis-backed per-account rate limiting (CR-058) yet, per this ticket's
documented scope boundaries; low risk until CR-012 ships a real session. KI-017 (updated)
— `apps/api`'s compiled production boot is confirmed broken until `db`/`types` switch to
`dist` exports or `apps/api`'s build switches to a bundler; both are deferred, ADR-worthy
decisions. KI-021 (`RideService`/registration-state terminology keys) unaffected — nothing
here touches those.

Follow-up: CR-012 (login/logout/session) is next.

## 2026-09-13 — CR-012 — Login/logout/session

Summary: `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me` — the
database-backed session store `docs/decisions.md` ADR-013 already decided (Postgres
`Session` row, opaque cookie token, SHA-256 hash at rest, 30-day rolling expiry extended
at most once/day). Also where ADR-013's CSRF mechanism gets its first real
implementation: an `Origin`/`Referer` preHandler rejecting a mismatched origin on every
unsafe method under `/v1` (not just the new routes — `/v1/auth/register`/`verify-email`
are now behind it too), allowing the request through when neither header is present
(`SameSite=Lax` is the primary defense; this is defense in depth). Login returns the same
generic `invalid_credentials` 401 for an unknown email and a wrong password — no account
enumeration — including a dummy Argon2id verify on the unknown-email path so the two
branches don't differ meaningfully in latency. Login does NOT require `emailVerified`
(that gate is organizer-action-specific, not a login precondition).
Files: `packages/db/src/schema/session.ts` (new) + migration
`0001_sparkling_toro.sql`, `packages/types/src/api/auth.ts` (added
`loginRequestSchema`/`LoginResponse`/`MeResponse`), `apps/api/src/modules/auth/`
(new: `session.ts` — create/validate/revoke + rolling expiry, `session.test.ts`; extended:
`auth.service.ts` — `loginUser`+`toPublicUser` exported, `auth.routes.ts` — three new
routes, `auth.routes.test.ts` — login/logout/me/CSRF suites), `apps/api/src/plugins/`
(new: `auth.ts` — `requireAuth` preHandler + `request.user`/`sessionId` module
augmentation, `csrf.ts` — the Origin/Referer preHandler, registered as `v1Routes`'s own
hook so it scopes to exactly `/v1`), `apps/api/src/app.ts` (`@fastify/cookie` registered,
no signing secret needed — the cookie carries only an opaque token checked against its DB
hash), `apps/api/src/routes/v1.ts` (wires `registerCsrf`), `apps/api/src/env.ts` (new
required `WEB_ORIGIN`, plus its own production-placeholder localhost check),
`apps/api/package.json` (added `@fastify/cookie`), `.env.example` (+`WEB_ORIGIN`),
`docs/{api,database,tasks}.md`, `.claude/context/{known-issues,architecture-map}.md`.

A real bug was found and fixed along the way: once `session.test.ts` became a second
Vitest file touching `users`/`email_verification_tokens`/`sessions` concurrently (Vitest
parallelizes test files by default), the existing `TRUNCATE TABLE ... RESTART IDENTITY
CASCADE` `beforeEach` pattern from CR-011 started deadlocking intermittently (Postgres
`ACCESS EXCLUSIVE` locks from two concurrent `TRUNCATE`s on overlapping tables). Fixed by
switching every such `beforeEach` (across both test files) to `DELETE FROM users`, relying
on the existing `ON DELETE CASCADE` foreign keys to clear the child tables — `DELETE`
takes row-level locks, not a table-level exclusive one, so it doesn't deadlock under
parallel file execution. Verified stable across 3 consecutive full `vitest run` passes
after the fix.

Decisions: none new at the ADR level — ADR-013 already fully specified this design;
CR-012 implements it. `docs/decisions.md` unchanged.

Known limitations: KI-022 updated — its CSRF gap is now closed (this ticket); the
rate-limiting (CR-058) and `@fastify/helmet` (CR-061, now headers-only) gaps remain open.
`revokedAt` on `sessions` is part of ADR-013's fixed column list but unused by any CR-012
code path (no admin "block" feature exists yet) — logout is a hard delete, not a
soft-revoke.

Validation: `turbo run lint/typecheck/build/test` (run separately) all green;
`format:check`/`lint:root` clean. 32 `apps/api` tests pass (was 15 before this ticket),
stable across repeated runs. Live-verified end to end against a real local Postgres
(`coffee_ride_dev`, Docker still unreachable in this environment — KI-019) and a running
`apps/api`: register → login (200 + `Set-Cookie` with `HttpOnly`/`SameSite=Lax`/`Path=/`)
→ `GET /me` (200) → logout (204, cookie cleared) → `GET /me` with the same cookie (401) →
`POST /login` with a mismatched `Origin` (403 `csrf_origin_mismatch`), all via curl.

Follow-up: CR-013 (Profile) is next per `docs/tasks.md`'s Auth section order.

## 2026-09-14 — CR-013 — Profile

Summary: a logged-in user can view and edit their own profile (`docs/design.md` §8:
`/me/profile` "Profile settings"). Neither `docs/product.md` nor `docs/design.md`
enumerated profile fields yet, so this session decided a minimal scope: `displayName`
(≤80 chars), `phone` (private, loose format check), `bio` (≤500 chars) — all
nullable/optional. Avatar/photo upload is explicitly out of scope (needs the S3
pipeline — KI-015, CR-086); recorded as a new known issue rather than silently
dropped. New endpoint: `PATCH /v1/users/me`, in a new `users` capability module
(`.claude/rules/architecture.md` lists `users` and `auth` as separate backend
areas) — no new `GET /v1/users/me`, since `GET /v1/auth/me` already returns the
full `User` shape once `toPublicUser` includes the new fields (CLAUDE.md: no
duplicate concepts).

This ticket also closed two real prerequisite gaps rather than working around them:
CR-012 shipped `POST /v1/auth/login` with no web UI, so `/me/profile` would have
been unreachable from a browser — added the `/login` screen
(`features/auth/login/`). And no cabinet shell/nav registry existed yet (ADR-009/
CR-054 still open) — built the minimal real thing (a participant nav-item registry
features push a descriptor into, a shell that renders from it and gates access on a
valid session) rather than a full dashboard; `/me` gets a stub page so the route
isn't a 404, full cabinet-home content stays CR-015/CR-054 scope.

Files: `packages/db/src/schema/user.ts` (+`displayName`/`phone`/`bio` nullable
columns) + migration `0002_nebulous_nebula.sql`; `packages/types/src/domain/user.ts`
(`User` gains the three fields, required-but-nullable — 3 pre-existing literals in
`register.test.tsx` updated to match), new `packages/types/src/api/users.ts`
(`updateProfileRequestSchema`/`UpdateProfileRequest`/`UpdateProfileResponse`);
`apps/api/src/modules/users/` (new: `user-response.schema.ts` — the one shared
"user over the wire" Zod shape, now also imported by `auth.routes.ts` instead of
its own copy; `users.service.ts`; `users.routes.ts`; `users.routes.test.ts`),
`apps/api/src/modules/auth/auth.service.ts` (`toPublicUser` extended),
`apps/api/src/routes/v1.ts` (registers `usersRoutes`); `packages/ui/src/components/
{Textarea,Textarea.test}.tsx` (new shared primitive — bio's multi-line control),
`packages/ui/src/terminology.ts` (+login copy in `AUTH_TERMS`, new `CABINET_TERMS`/
`PROFILE_TERMS`); `apps/web/src/lib/api/{errors,current-user}.ts` (new — `ApiError`
extracted out of `register/api.ts` so login/profile don't each grow a third copy),
`apps/web/src/lib/auth/current-user-context.tsx`, `apps/web/src/lib/cabinet/
{types,participant-nav}.ts`, `apps/web/src/components/cabinet/CabinetShell.tsx`,
`apps/web/src/features/auth/login/` (new), `apps/web/src/features/participant/
profile/` (new), `apps/web/src/app/login/page.tsx`, `apps/web/src/app/me/
{layout,page,profile/page}.tsx`, `apps/web/vitest.config.mts` (+`resolve.alias` for
`@/*`, needed the moment a Vitest-tested file first used that import form).

Two real bugs were found and fixed along the way, not worked around: (1)
`apps/api/src/plugins/db.ts` never closed its postgres.js connection pool on
`app.close()` — invisible with one or two test files, but a genuine resource leak
that started exhausting Postgres's `max_connections` once this ticket's fourth
DB-touching Vitest file added enough concurrent `buildApp()` calls, surfacing as
intermittent `500`s; fixed with an `onClose` hook calling `db.$client.end()`. (2)
Even after that fix, two test files' concurrent `beforeEach: DELETE FROM users`
(CR-011/CR-012's TRUNCATE-deadlock fix) still collided with each other's in-flight
register/login/patch requests often enough to surface as intermittent Postgres
deadlocks/500s once a fourth file joined — same class of bug as CR-012's, now at
the file-scheduling level instead of the query level. Fixed by setting
`fileParallelism: false` in `apps/api/vitest.config.ts` (integration tests against
one shared real Postgres database don't need file-level parallelism; the suite is
small enough that serializing costs no meaningful time). Verified stable across 5
consecutive full `vitest run` passes after both fixes.

Decisions: none new at the ADR level. The profile-field scope decision above is
product-level, not architectural — recorded here and in `docs/tasks.md`, not
`docs/decisions.md`.

Known limitations: new — avatar/photo upload is not implemented (needs the S3
pipeline, KI-015/CR-086); `phone`'s format check is deliberately loose (no real
E.164 validation); the participant nav registry (`lib/cabinet/participant-nav.ts`)
currently has exactly one entry and no feature-flag support yet — CR-054 is the
ticket that generalizes it (widgets, organizer side, flags). KI-022 unaffected —
`PATCH /v1/users/me` is not an auth endpoint, general rate-limit tier applies.

Validation: `turbo run lint/typecheck/build/test` (run separately) all green;
`format:check`/`lint:root` clean. 44 `apps/api` tests pass (was 38 before this
ticket), stable across 5 consecutive full-suite runs. `apps/web` gained 22 tests
across 2 new files (was 8). Live-verified end to end: curl sequence against a real
Postgres + running `apps/api` (register → login → `GET /me` showing the new null
fields → `PATCH /v1/users/me` unauthenticated 401 → authenticated 200 with fields
persisted and confirmed via a follow-up `GET /me` → invalid payload 400 →
mismatched-`Origin` 403); and a full browser flow against a real `next dev` server
(unauthenticated `/me` → redirected to `/login`; login → redirected to `/me`;
clicked the registry-rendered "Профиль" nav link → `/me/profile` pre-filled with
the account's existing values; edited `displayName`, saved, saw the success
message; reloaded the page and confirmed the new value persisted, not just
optimistic UI) via the `browser-automation` skill — no console errors beyond the
expected pre-login 401 on `/api/v1/auth/me`.

Follow-up: CR-014 (Organizer profile) is next per `docs/tasks.md`'s Organizer
section order.

## 2026-09-14 — CR-014 — Organizer profile

Summary: a logged-in user can create and edit their own `OrganizerProfile`
(`docs/product.md`: "create organizer profile" is MVP capability #2;
`docs/design.md` §8: `/organizer/profile`). `docs/database.md` only said
"public organizer data linked to User" — this session picked a minimal viable
scope, same discipline as CR-013's `User` profile: `name` (required, 1-100
chars — the organizer's public identity, deliberately separate from
`User.displayName` since `docs/product.md` confirms individuals/clubs/shops/
teams all share this one path) and `description` (optional, ≤500 chars).
Logo/avatar is explicitly out of scope (needs the S3 pipeline — same KI-023
gap CR-013 already opened, not a new one). At most one `OrganizerProfile` per
`User` (ADR-006), enforced with a real unique index, not just application
logic. Creation is gated on `User.emailVerified`
(`.claude/rules/security.md`: "Require a verified email before an account
can act as an organizer" — `packages/db/src/schema/user.ts`'s own comment
already committed to enforcing this starting here).

Three "me"-scoped endpoints, not a `users.me`-style single `PATCH`, because
creation is a distinct capability-granting action: `POST`/`GET`/`PATCH
/v1/organizers/me` — `POST` 403s on an unverified email and 409s on a second
create for the same user; `GET`/`PATCH` 404 `organizer_profile_not_found`
before a profile exists. No public `GET /v1/organizers/:id` yet — nothing
reads organizer data publicly until `Ride` exists, deferred to whichever ride
ticket first embeds it in a ride response.

`CabinetShell` (CR-013) was hard-coded to the participant nav registry and a
`/login` redirect — generalized to take a `navItems` prop instead, since
`docs/design.md` §8 already says both cabinets share one shell rendering from
the feature registry (ADR-009), not a parallel copy per cabinet. New
`apps/web/src/lib/cabinet/organizer-nav.ts` registry (one entry:
`/organizer/profile`). `/organizer/profile` renders one form covering both
states (`OrganizerProfileForm`: fetches the profile, shows a create form on a
404, an edit form otherwise) rather than two screens. `/organizer` (bare)
gets a minimal stub page, same reasoning as CR-013's `/me` stub — full
dashboard content is CR-015. Without CR-015's dashboard nothing yet links a
participant into the organizer cabinet, so `/me` gained one small additive
CTA card linking to `/organizer/profile` (same justification CR-013 used for
adding `/login`: a screen `docs/design.md` already specifies but that would
otherwise be unreachable except by typing the URL).

Files: `packages/db/src/schema/organizer-profile.ts` (new) + migration
`0003_shiny_susan_delgado.sql`, `schema/index.ts` (+export);
`packages/types/src/domain/organizer-profile.ts` (new),
`src/api/organizers.ts` (new), `src/index.ts` (+exports); `apps/api/src/
modules/organizers/` (new: `organizer-profile-response.schema.ts`,
`organizers.service.ts` — `OrganizerServiceError`, `createOrganizerProfile`/
`getOwnOrganizerProfile`/`updateOrganizerProfile`, `organizers.routes.ts`,
`organizers.routes.test.ts`), `apps/api/src/routes/v1.ts` (registers it);
`apps/web/src/components/cabinet/CabinetShell.tsx` (+`navItems` prop),
`apps/web/src/app/me/layout.tsx` (passes `PARTICIPANT_NAV_ITEMS` explicitly
now), `apps/web/src/lib/cabinet/organizer-nav.ts` (new), `apps/web/src/app/
organizer/{layout,page,profile/page}.tsx` (new), `apps/web/src/features/
organizer/profile/` (new: `api.ts`, `nav.ts`,
`components/OrganizerProfileForm.tsx`, `organizer-profile.test.tsx`),
`apps/web/src/app/me/page.tsx` (+CTA, additive); `packages/ui/src/
terminology.ts` (+`ORGANIZER_TERMS`, +`CABINET_TERMS` organizer-nav/CTA/
stub entries); `docs/api.md` (new Organizers section), `docs/database.md`
(`OrganizerProfile` description), `docs/tasks.md` (CR-014 checked off).

A real bug was found and fixed during this session's own test-writing, not
left to production: the success-message text for `OrganizerProfileForm` was
initially derived from the `profile` state variable at render time, but
`setProfile(response.organizerProfile)` (called right after a successful
create) already flips that state to non-null before the success message
renders — so a fresh _create_ was showing the _edit_ success copy
("Изменения сохранены." instead of "Профиль организатора создан."). Fixed by
capturing `wasCreate = profile === null` before the request and setting an
explicit `successMessage` string from that captured value, not by re-deriving
text from `profile` after the state update. Caught by this ticket's own
Vitest suite before it ever reached a browser.

Decisions: none new at the ADR level — the field-scope decision above is
product-level (same tier as CR-013's), recorded here and in
`.claude/context/current-task.md`, not `docs/decisions.md`.

Known limitations: new — no public organizer-read endpoint yet (nothing
needs it until `Ride` exists); `/organizer` dashboard content is CR-015;
organizer capability itself has no server-side authorization check to
_exercise_ yet (CR-016, "Organizer authorization" — this ticket only builds
the capability-granting resource; nothing organizer-owned exists in the
schema to protect until `Ride`, CR-017). No new avatar/logo gap — this is the
same deferred-to-S3-pipeline gap CR-013's KI-023 already tracks, not a
second one.

Validation: `turbo run lint/typecheck/build/test` (run separately) all green;
`format:check`/`lint:root` clean. `apps/api` gained 12 new tests (50 total,
was 38 — this changelog's prior "44" for CR-013 was itself off; the actual
pre-CR-014 count was 38, confirmed by a direct count this session).
`apps/web` gained 9 new tests (31 total, was 22). `next build` compiles
`/organizer` and `/organizer/profile` as new static routes cleanly. Live-
verified end to end: curl sequence against a real Postgres + running
`apps/api` (unauth 401 → unverified-email create 403 → verify email → create
201 → duplicate create 409 → invalid payload 400 → `GET` 200 → `PATCH`
rename 200 (description unchanged) → `PATCH` clear description 200 (`null`)
→ mismatched-`Origin` 403, each confirmed against a direct DB read too); and
a full browser flow via the `browser-automation` skill against a real `next
dev` server (unauthenticated `/organizer/profile` → redirected to `/login`;
login → redirected to `/me`; `/me` showed the new organizer CTA card; visited
`/organizer/profile` — loaded in edit mode, pre-filled with the account's
existing `OrganizerProfile`; edited the description, saved, saw the success
message; reloaded and confirmed the new value persisted, not just optimistic
UI) — no console errors beyond the expected pre-login 401 on
`/api/v1/auth/me`.

Follow-up: CR-015 (Organizer dashboard) is next per `docs/tasks.md`'s
Organizer section order.
