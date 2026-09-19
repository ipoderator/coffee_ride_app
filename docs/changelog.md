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

Entries before CR-010 (CR-000 through CR-009, 2026-09-09..2026-09-13) were moved
to `docs/changelog-archive/2026.md` on 2026-09-15 (CR-021 session), per this
section's own rule — the live file had grown past ~40 entries.

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

## 2026-09-14 — CR-015 — Organizer dashboard

Summary: `/organizer` (a static `EmptyState` stub since CR-014) now renders a
real ADR-009 widget registry, per `docs/design.md` §8: "Dashboard (widgets
from the ADR-009 registry)".

The user asked to do this together with CR-016 ("Organizer authorization") in
one pass. Checked the repository first (`.claude/CLAUDE.md`'s non-negotiable
rule) and two sibling Claude sessions running on the same machine — no prior
plan for combining them existed anywhere, in chat or in the repo. CR-014's
own changelog entry and `.claude/context/project-state.md` already say CR-016
is blocked on `Ride` (CR-017+): there is no organizer-owned resource in the
schema yet for an ownership check to protect. Per the user's own instruction
to follow the plan as it was originally documented, this session did CR-015
alone; CR-016 stays unchecked and unmodified in `docs/tasks.md`.

`docs/tasks.md` also separately lists CR-054 ("Feature registry for dashboard
nav/widgets ... + feature flags") as the ticket that generalizes the nav/
widget registry pattern across both cabinets with flag support. CR-015 does
not anticipate that — same "build the minimal real thing now" discipline
CR-013 used for the nav registry itself before CR-054 existed. New
`DashboardWidget` descriptor (`apps/web/src/lib/cabinet/types.ts`, same shape
as `CabinetNavItem`: `id`/`order`/`Component`) and a small, organizer-only
`ORGANIZER_WIDGETS` registry (`lib/cabinet/organizer-widgets.ts`) — no feature
flags, no participant-side change.

Only one organizer-owned data source exists in the schema today —
`OrganizerProfile` (CR-014) — so the only honest widget this ticket could
build is a read-only summary of it: `OrganizerProfileWidget`
(`features/organizer/profile/components/`, registered via
`organizerProfileWidget` in that feature's existing `nav.ts`, alongside its
nav-item descriptor). Reuses `getOrganizerProfile()` as-is — no new API
endpoint, no contract change. States: loading (`Skeleton`), no profile yet
(`EmptyState` + a "Создать профиль" link to `/organizer/profile`, keyed off
the existing `organizer_profile_not_found` 404), any other load failure
(`ErrorState`, inline), success (`Card` with name, description when present,
and a "Редактировать" link). No ride-related widget — `Ride` doesn't exist
until CR-017+; a placeholder widget for it would have been exactly the kind
of speculative building CR-014's own scoping notes avoided elsewhere.

`/organizer/page.tsx` now maps `ORGANIZER_WIDGETS` into a grid instead of the
CR-014 stub `EmptyState`, keeping that `EmptyState` only as a defensive
fallback for an empty registry (unreachable today — one widget always
registers). `packages/ui/src/terminology.ts` gained widget-specific
`ORGANIZER_TERMS` entries and two generic `CABINET_TERMS` entries
(`dashboardNoWidgetsTitle`/`Description`, replacing the now-dead
`organizerHomeEmptyTitle`/`organizerHomeEmptyDescription` stub copy — checked
nothing else referenced them before removing).

Decisions: none new at the ADR level.

Known limitations: unchanged from CR-014 — no public `GET /v1/organizers/:id`
yet; organizer capability still has no server-side authorization check to
_exercise_ (CR-016, confirmed still blocked on `Ride`/CR-017+, not started
this session); `ORGANIZER_WIDGETS` has exactly one entry and no feature-flag
support, same as `ORGANIZER_NAV_ITEMS` — CR-054 generalizes both.

Validation: `turbo run typecheck lint test build` (all 9 packages, run
together against a real `DATABASE_URL`) clean. `apps/api` 50 tests
(unchanged — no `apps/api` file touched this ticket), `apps/web` 35 tests
(was 31, +4, all in the new
`organizer-profile-widget.test.tsx`), `packages/ui` 85 tests (unchanged — no
new component, only terminology data). `format:check`/`lint:root` clean
(after one `prettier --write` pass this session caught by the same command).
`next build` compiles `/organizer` cleanly with the new widget grid. Live-
verified via the `browser-automation` skill against a real `next dev` server
and `apps/api`: registered and email-verified a fresh account (via curl, since
no verify-email screen exists yet — unchanged from CR-014), logged in through
the browser, visited `/organizer` with no `OrganizerProfile` yet — saw the
"Профиль организатора ещё не создан" empty state with a working "Создать
профиль" link; created a profile through the existing `/organizer/profile`
form; revisited `/organizer` — saw the populated widget (name, description,
working "Редактировать" link). No console errors beyond the widget's own
expected 404 fetch (the "not found" case being exercised, not a bug) and
ordinary Next dev-server hot-reload noise. Test account and its data deleted
from the scratch DB afterward.

Follow-up: CR-016 (Organizer authorization) stays blocked until `Ride`
(CR-017, "Create ride") exists — that is the next logical Rides-section
ticket per `docs/tasks.md`'s order, and the ticket that will finally give
CR-016 something organizer-owned to check ownership against.

## 2026-09-14 — CR-017 — Create ride

Summary: the first `Ride` entity ticket — `docs/design.md` §8:
`/organizer/rides/new` "Create ride". User asked to continue "per the
original plan"; per CR-015's own follow-up note, that meant CR-017, since
CR-016 ("Organizer authorization") stays blocked until this ticket's `Ride`
table exists.

Scope decision (full rationale in `.claude/context/current-task.md`): CR-017
creates a _minimal, valid draft_, not a fully-configured ride — `docs/design.md`
§8 lists a separate "Edit draft" screen (CR-018) and `docs/product.md`'s MVP
capability #3 ("ride creation/edit/publish") already spans three tickets. Only
`title`/`bicycleType`/`startsAt`/`startTimezone` are required at creation;
every other scalar field the table has room for (`description`, capacity,
price, distance/duration/pace/elevation, difficulty, cover image) is nullable,
filled in by CR-018. Route/stops/services/requirements are not this table at
all — `docs/product.md`'s MVP list keeps "ride creation/edit/publish" (#3)
distinct from "GPX route" (#5) and "stops/services/requirements" (#6);
`RideRequirement`/`RideService` have no CR number yet (same "not yet
scheduled" gap KI-021 already flagged for the services enum).

Ownership: `docs/database.md` says `Ride` is owned by `OrganizerProfile`
(written after CR-014), not directly by `User` — ADR-006's older
"`ride.organizerId === session.userId`" phrasing predates that decision. The
real FK is `rides.organizer_id -> organizer_profiles.id`; identity still
traces only to the session (never a client-supplied id) by resolving the
caller's own `OrganizerProfile` server-side, same pattern CR-014 uses for
`emailVerified`. Creating a ride requires the caller to already have one —
403 `organizer_profile_required` otherwise (mirrors CR-014's
`email_verification_required` UX). This is deliberately NOT CR-016: that
ticket checks ownership of an _already-existing_ ride on a later mutation
(edit/publish/cancel); CR-017 only establishes ownership at creation.

Architecture fix discovered and fixed in this ticket (not a new ADR): `RideStatus`/
`BicycleType`/`DifficultyLevel` (CR-064) lived in `packages/ui/src/terminology.ts`,
but `apps/api` needed the same enums for Zod validation and `packages/db` the
same value lists for its Postgres enums — and `apps/api` must never depend on
`packages/ui` (`.claude/rules/architecture.md`). Moved the type/value-list
definitions to `packages/types/src/domain/ride.ts`; `packages/ui` now depends
on `types` (previously had zero such dependency) and re-exports the types
unchanged, keeping only the Russian label maps. No behavior change — this was
heading toward `.claude/CLAUDE.md`'s "do not create duplicate concepts" the
moment a second copy got invented for `apps/api`/`packages/db`.

Timezone: ADR-012 requires the instant plus the ride's IANA start zone.
Server-side Zod validation is loose (any zone `Intl.DateTimeFormat` accepts,
same tier as CR-013's phone check); the web picker is narrower —
`RUSSIAN_TIMEZONE_OPTIONS` (`packages/ui`), the 11 real Russian IANA zones
with city labels, matching ADR-012's own "Russia spans eleven offsets" framing,
not a raw ~400-entry `Intl.supportedValuesOf` dump. Converting the organizer's
entered local wall-clock time + chosen zone into the correct UTC instant
needed real zone-offset math — no timezone library exists as a dependency
anywhere in this repo — so a small utility,
`apps/web/src/lib/datetime/zoned-time.ts` (`zonedTimeToUtcIso`), was added and
unit-tested against Europe/Moscow (UTC+3), Asia/Krasnoyarsk (UTC+7), Europe/
Kaliningrad (UTC+2), and Asia/Vladivostok (UTC+10) — all DST-free year-round
(Russia abolished DST in 2014), so no DST-transition edge case exists for this
product's real target zones.

Discoverability: no ticket yet builds `docs/design.md` §8's `/organizer/rides`
"My rides" list — flagged as a new known issue (KI-024), not silently worked
around. Added `organizerRidesNavItem` ("Заезды" → `/organizer/rides/new`) as a
stopgap nav entry, same discipline as CR-013/014's stub screens; superseded
once the real list lands. Post-create UX is self-contained (an inline success
card showing the created ride's title/status/bicycle type/start time via
`MetricTile`/`StatusBadge`) rather than linking to an edit/detail screen that
doesn't exist yet.

Files: `packages/types/src/domain/ride.ts` (new — `RIDE_STATUSES`/`RideStatus`,
`BICYCLE_TYPES`/`BicycleType`, `DIFFICULTY_LEVELS`/`DifficultyLevel`, `Ride`),
`src/api/rides.ts` (new — `createRideRequestSchema`, IANA-zone `refine`),
`src/index.ts` (+exports); `packages/ui/package.json` (+`types` dependency),
`src/terminology.ts` (re-exports the 3 moved types, +`RUSSIAN_TIMEZONE_OPTIONS`, +`RIDE_CREATE_TERMS`); `packages/db/src/schema/ride.ts` (new — `rides` table,
`ride_status`/`bicycle_type` pg enums, 7 CHECK constraints), `schema/index.ts`
(+export), migration `0004_sleepy_garia.sql`, applied to `coffee_ride_dev`;
`apps/api/src/modules/rides/{ride-response.schema.ts,rides.service.ts,
rides.routes.ts,rides.routes.test.ts}` (new), `routes/v1.ts` (register);
`apps/web/src/lib/datetime/zoned-time.ts` (new, +test),
`src/features/organizer/rides/{api.ts,nav.ts,components/CreateRideForm.tsx,
rides.test.tsx}` (new), `app/organizer/rides/new/page.tsx` (new),
`lib/cabinet/organizer-nav.ts` (+entry); `docs/api.md`/`docs/database.md`
(new `Ride` sections).

Decisions: none new at the ADR level — the ownership-model and type-ownership
points above are documented here and in `.claude/context/current-task.md`,
not `docs/decisions.md` (corrections/clarifications of existing ADRs, not new
architectural decisions).

Known limitations: new — `RideRequirement`/`RideService` still have no CR
number (KI-021's sibling gap, now explicitly also true for the requirements
entity); no `GET /v1/rides`/`GET /v1/rides/:id` yet (CR-018+ needs at least
one to load a draft back for editing); no "My rides" list screen (KI-024, new);
`Ride.coverImageUrl` joins the KI-023 S3-pipeline-deferred gap a third time,
not a new one; CR-016 remains genuinely startable now that `Ride` exists, but
was not started this session (user's own instruction was to follow the
already-documented plan, which keeps CR-016 as its own ticket after CR-018+
gives it a mutation to protect, not CR-017's creation-only endpoint).

Validation: `turbo run typecheck lint test build` (all 9 packages, run
together against a real `DATABASE_URL`) clean. `apps/api` gained 8 new tests
(58 total, was 50); `apps/web` gained 9 new tests (44 total, was 35 — 5 in
`rides.test.tsx`, 4 in `zoned-time.test.ts`); `packages/ui`/`packages/types`
unaffected in test count (type-ownership move only). `format:check`/
`lint:root` clean (after one `prettier --write` pass this session).
`next build` compiles `/organizer/rides/new` cleanly. Live-verified end to
end: curl sequence against a real Postgres + running `apps/api` (unauth 401 →
no-organizer-profile 403 → create organizer profile → valid create 201,
cross-checked against a direct DB read showing the correct stored UTC instant
→ empty title 400 → invalid bicycleType 400 → invalid timezone 400 →
mismatched-Origin 403); full browser flow via the `browser-automation` skill
against a real `next dev` server (unauthenticated redirect to `/login`; login;
form defaults confirmed — Гравийный/Москва; filled Красноярск (UTC+7) + 18:30
local; submitted; success view showed the correct LOCAL time back — "15 июня
2027 18:30", not UTC-shifted; nav showed the new "Заезды" entry) — a second,
independent direct-DB check confirmed the stored instant (`14:30:00+03` =
`11:30 UTC`) matches 18:30 Krasnoyarsk exactly. No console errors beyond the
expected pre-login 401. Test accounts/rides deleted from the scratch DB
afterward.

Follow-up: CR-018 (Edit draft) is next per `docs/tasks.md`'s Rides section
order — needs at least a `GET /v1/rides/:id` to load a draft back, and per
KI-024 will hit the "no My rides list" gap unless that ticket is scheduled
first.

## 2026-09-14 — CR-088/CR-016/CR-018 — Organizer rides list, authorization & edit draft

User asked to continue per the already-documented plan. Next unchecked ticket
was CR-018 ("Edit draft"), but KI-024 (opened by the CR-017 session) blocked
starting it: no ticket built `/organizer/rides` ("My rides"), so CR-018's
edit screen would have had no way to be reached from the UI. Per KI-024's own
"Next action," added CR-088 to `docs/tasks.md`'s Rides section (CR-001..CR-087
had no gaps — first free number) and built it before CR-018, in the same
session. CR-016 ("Organizer authorization," unchecked since CR-014) has no
surface of its own to exercise — it _is_ the ownership check inside CR-018's
`GET`/`PATCH /v1/rides/:id`, so it lands together with CR-018 rather than as
a separate change. No migration in any of the three — CR-017's `rides` table
already had every column CR-018 needed.

CR-088 — Organizer rides list: `GET /v1/rides/mine`
(`apps/api/src/modules/rides`), the API's first real cursor-paginated
collection endpoint (ADR-011 §2) — new shared `apps/api/src/lib/cursor.ts`
(`encodeCursor`/`decodeCursor`/`clampLimit`), reused by every later collection
endpoint instead of each one re-deriving its own encoding. Requires a session
(`401` otherwise); no `OrganizerProfile` yet is `200 { items: [], nextCursor:
null }`, not an error — distinct from `createRide`'s `403`, since listing "my
rides" for someone who hasn't created any is a legitimate empty state.
Deliberately `/mine`, not a `?filter=` on the still-unimplemented public
`GET /v1/rides` (CR-024) — "whose rides" must never be a client-supplied
value (`.claude/rules/security.md`), and the two endpoints will show
different things anyway (any status here vs. `published`+ only there). Sorted
`(createdAt desc, id desc)` — newest draft first. `apps/web` gained
`/organizer/rides` (`features/organizer/rides/components/RidesList.tsx`):
loading/error/empty states per `.claude/rules/frontend.md`, rides grouped by
`RIDE_STATUSES`' declared order, each card linking into CR-018's edit screen.
`organizerRidesNavItem` now points here instead of straight at
`/organizer/rides/new`; the list page itself carries the "new ride" CTA.

CR-016/CR-018 — Organizer authorization + Edit draft: `GET`/`PATCH /v1/
rides/:id`, both ownership-scoped through the caller's own `OrganizerProfile`
(`rides.service.ts`'s `getRideForOwner`/`updateRideDraft`, resolved from the
session, never a client-supplied id). Both 404 `ride_not_found` for a ride
that doesn't exist at all **and** for one that exists but belongs to a
different organizer — deliberately the same response either way, so a
non-owner can't distinguish the two (same resource-enumeration reasoning as
login's generic `invalid_credentials`). `PATCH` is draft-only: `409
ride_not_editable` once the ride has left `draft` — publishing/cancelling/
finishing stay separate tickets (CR-019/CR-021/CR-022), not folded into a
general "edit anything anytime" endpoint. Body covers every field CR-017 left
`null`: `title`, `description` (new Zod-layer cap — 2000 chars, not the 5000
`docs/database.md` had provisionally guessed; no DB CHECK either way),
`bicycleType`, `startsAt`+`startTimezone` (must arrive together or not at
all — a `.refine` rejects a lone change to either), `participantLimit`,
`priceRub`, `distanceKm`, `elevationGainMeters`, `paceKmh`,
`durationMinutes`, `difficulty`. `coverImageUrl` stays out (KI-023, S3
pipeline deferred, same call CR-017 made). `apps/web/src/lib/datetime/
zoned-time.ts` gained `utcIsoToZonedLocalInput` — the inverse of CR-017's
`zonedTimeToUtcIso`, needed to prefill the edit form's `datetime-local` input
from an existing UTC instant; unit-tested as an exact round-trip against all
11 Russian zones `RUSSIAN_TIMEZONE_OPTIONS` offers. New `/organizer/rides/
[id]/edit` (`EditRideForm`) — not-found state for someone else's/a
non-existent id, prefills every field, renders read-only with no save button
once the ride leaves `draft`, duplicate-submit-protected `PATCH`.
`CreateRideForm`'s success view now links straight into the new edit screen
and the new list (previously only "back to dashboard" — neither existed yet).

Files: `apps/api/src/lib/cursor.ts` (new); `packages/types/src/api/rides.ts`
(+`listRidesQuerySchema`, `updateRideRequestSchema`, `ListRidesResponse`,
`UpdateRideResponse`); `apps/api/src/modules/rides/{rides.service.ts,
rides.routes.ts,rides.routes.test.ts}` (extended — `routes/v1.ts` already
registered this module); `apps/web/src/lib/datetime/zoned-time.ts` (+fn,
+test); `apps/web/src/features/organizer/rides/{api.ts,nav.ts,rides.test.tsx,
components/RidesList.tsx,components/EditRideForm.tsx,
components/CreateRideForm.tsx}` (new/extended); `apps/web/src/app/organizer/
rides/{page.tsx,[id]/edit/page.tsx}` (new); `packages/ui/src/terminology.ts`
(+`RIDE_LIST_TERMS`, `RIDE_EDIT_TERMS`, +2 `RIDE_CREATE_TERMS` keys);
`docs/api.md`/`docs/database.md` (Rides section updated); `docs/tasks.md`
(CR-088 added and checked, CR-016/CR-018 checked).

Decisions: none new at the ADR level. The `/mine`-suffix convention, the
"404 either way" ownership response, and the draft-only `PATCH` gate are
documented here and in `.claude/context/current-task.md`, not
`docs/decisions.md` — applications of ADR-006/ADR-011's existing rules to a
new endpoint, not new architectural decisions.

Known limitations: none new. KI-024 (no "My rides" list) is resolved — see
`.claude/context/known-issues.md`'s Resolved section.

A real bug was found and fixed while building `listOwnRides`, not left as a
workaround: interpolating a JS `Date` directly into a hand-written Drizzle
`sql` template (for the cursor's keyset-comparison condition) throws
`ERR_INVALID_ARG_TYPE` inside the `postgres` driver's own parameter binding —
confirmed live, not guessed — because the driver only auto-serializes
parameters bound through Drizzle's typed column helpers, not a raw `Date` in
a manual template. Fixed by passing the cursor's `createdAt` as the ISO
string it already is (`::timestamptz` cast on the SQL side), not a `Date`.
Also found and fixed: this file's own new tests' last-run case (a
CSRF-rejected `PATCH`) creates a real ride via a preceding successful `POST`
before the rejected request, unlike the file's original last test (which
never got past the CSRF check at all) — left a `rides` row (and its
`organizer_profiles`/`users` rows) alive after the file finished, which then
broke the next file's `DELETE FROM users` with a foreign-key violation
(`rides.organizer_id` is `ON DELETE RESTRICT`). Fixed with an `afterAll` in
`rides.routes.test.ts` that cleans up after this file's own tests — a suite
shouldn't depend on running last to avoid leaking state into whatever runs
next.

Validation: `turbo run typecheck lint test build` (all 25 tasks, run together
against a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/
coffee_ride_dev` — Docker Desktop still unavailable in this environment)
green, twice in a row for `apps/api`'s suite specifically (stability check
after the two bugs above were fixed). `apps/api` gained 15 new tests (73
total, was 58); `apps/web` gained 13 new tests (56 total, was 44 — plus 4 new
`zoned-time.test.ts` cases for the reverse conversion). `format:check`/
`lint:root` clean (one `prettier --write` pass this session). `next build`
compiles both new routes (`/organizer/rides` static, `/organizer/rides/[id]/
edit` dynamic) cleanly. Live-verified end to end against a real Postgres +
running `apps/api`: curl sequence covering `GET /v1/rides/mine` (401 → empty
page → populated + `limit=1` pagination across two rides, `nextCursor`
followed to a real second page → malformed cursor 400 `invalid_cursor`),
`GET`/`PATCH /v1/rides/:id` (a stranger's request 404 `ride_not_found`;
publishing then `PATCH`ing 409 `ride_not_editable`; invalid field 400;
valid `PATCH` 200, cross-checked against a direct DB read). Full browser
walkthrough via the `browser-automation` skill against a real `next dev`
server + `apps/api`: logged in, confirmed the "Заезды" nav link now opens
`/organizer/rides`, the list showed the seeded draft grouped under
"Черновик" with the correct local start time, clicking the card opened the
edit screen with every field correctly prefilled (including the UTC→local
round-trip), edited the title, saved (success message shown), reloaded — the
new title persisted; separately confirmed the not-found state renders
correctly for a random ride id. No console errors beyond the expected
pre-login 401 and the expected 404 on the not-found check. Test accounts/
rides deleted from the scratch DB afterward.

Follow-up: CR-019 (Publish ride) is next per `docs/tasks.md`'s Rides section
order.

## 2026-09-14 — CR-019 — Publish ride (+ CR-059's remaining scope)

User asked to continue per the already-documented plan. Next unchecked ticket
was CR-019 ("Publish ride"): `POST /v1/rides/:id/publish`, `draft ->
published`. `.claude/rules/security.md` names this exact action — "Require a
verified email before an account can act as an organizer (publish a ride)" —
so the one remaining piece of CR-059 ("Email verification flow ... gates
organizer publish action", `docs/tasks.md`'s own note: "gating organizer
publish on `emailVerified` is still open, no publish action exists yet")
landed together with it, same reasoning as CR-016 landing with CR-018 last
session: the gate only has an action to protect once that action exists.

`apps/api/src/modules/rides/rides.service.ts` gained `publishRide`: same
ownership resolution as `getRideForOwner`/`updateRideDraft` (404
`ride_not_found` whether the ride doesn't exist or belongs to a different
organizer, never disclosed which); a fresh-DB-read `emailVerified` check (403
`email_verification_required` — the identical code `POST /v1/organizers/me`
already uses, so `apps/web` branches on one stable code regardless of which
endpoint returned it); then the lifecycle gate itself (409
`ride_not_publishable`, a new code distinct from `PATCH`'s
`ride_not_editable`, for any non-`draft` status). Check order: ownership
first (never leak existence to a non-owner), then the caller-level
email-verification gate, then the resource-state gate. Deliberately scoped to
exactly `draft -> published` — `docs/product.md`'s lifecycle has further
states (`registration_open`/`registration_closed`/...) but no ticket in
`docs/tasks.md` owns entering `registration_open` at all (CR-020 only closes
it); inventing that transition here would have been unrequested scope, so it
is flagged instead as new known issue KI-025. No `packages/db` migration —
`published` already existed in the `ride_status` enum since CR-017.

`apps/web/src/features/organizer/rides/components/EditRideForm.tsx` gained an
"Опубликовать" button next to "Сохранить", visible only while the ride is a
draft (same screen `docs/design.md` §8 already uses for editing — no separate
publish screen exists), with the same duplicate-submit-protection/loading-
state discipline as Save. On `email_verification_required` it shows the same
guiding-banner pattern `OrganizerProfileForm` already established for the
identical code, reusing the same Russian wording as a new `RIDE_EDIT_TERMS`
key. A successful publish updates the ride in place, so the form immediately
flips to its existing read-only view (`ride.status !== 'draft'`) without a
reload.

While building this, confirmed a real, growing gap and did not silently work
around it: no `/verify-email` web screen exists anywhere in `apps/web` (only
the API call CR-011 built) — an organizer who hits either
`email_verification_required` gate (this one, or CR-014's) has no in-app way
to actually complete verification. Recorded as new known issue KI-026, not
fixed here — out of this ticket's scope, and real email delivery is ADR-007
(still Pending).

Files: `packages/types/src/api/rides.ts` (+`PublishRideResponse`);
`apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,
rides.routes.test.ts}` (extended — new `RIDE_NOT_PUBLISHABLE`/
`EMAIL_VERIFICATION_REQUIRED` error factories, `POST /:id/publish`, 7 new
tests); `apps/web/src/features/organizer/rides/{api.ts,
components/EditRideForm.tsx,rides.test.tsx}` (extended — `publishRide`
client, publish button + banner, 3 new tests); `packages/ui/src/
terminology.ts` (+4 `RIDE_EDIT_TERMS` keys: `publish`/`publishPending`/
`publishSuccess`/`publishEmailVerificationRequired`); `docs/api.md` (filled in
the `POST /v1/rides/:id/publish` line); `.claude/context/known-issues.md`
(+KI-025, +KI-026); `docs/tasks.md` (CR-019 and CR-059 both checked off).

Decisions: none new at the ADR level — the check-order and error-code choices
are documented in `.claude/context/current-task.md`, applications of
ADR-006/ADR-011's existing rules to a new endpoint.

Known limitations: KI-025 (no ticket transitions a ride into
`registration_open`) and KI-026 (no verify-email web screen) are both new,
see `.claude/context/known-issues.md`.

Validation: `turbo run typecheck lint test build` (all 25 tasks, run twice —
once after implementation, once again after the live checks below — against a
real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
Docker Desktop still unavailable in this environment) green both times.
`apps/api` gained 7 new tests (80 total, was 73); `apps/web` gained 3 new
tests (59 total, was 56). `format:check`/`lint:root` clean (one incidental
one-line Prettier fix in `docs/tasks.md`, pre-existing drift unrelated to this
session's own edits, picked up while checking off CR-019/CR-059 in the same
file). Live-verified via curl against a real Postgres + running `apps/api`:
401 (no cookie) → 404 (non-existent id) → 404 (another organizer's ride,
confirmed via a second registered account) → 403 `email_verification_required`
(a third account, `emailVerified` flipped back to `false` directly in the DB
to isolate this gate) → 200 happy path (cross-checked against a direct
`SELECT` — `status`/`updated_by`/`updated_at` all correct) → 409
`ride_not_publishable` (re-publishing the same now-published ride) → 403 CSRF
(mismatched `Origin`). Full browser walkthrough via the `browser-automation`
skill against a real `next dev` server + the pre-existing `apps/api`: logged
in, opened a draft ride's edit screen, confirmed the "Опубликовать" button,
clicked it, confirmed the `POST .../publish` response was `200`, the success
message appeared, the status badge changed to "Опубликован", and the form
became read-only with no publish/save buttons left — screenshot taken and
visually confirmed. No console errors or failed requests during the actual
check. Test accounts/rides deleted from the scratch DB afterward.

Found and fixed one real, self-inflicted environment issue while running the
live browser check (not a product bug): running `turbo run build` (which
invokes `next build` for `apps/web`) against the same `.next` directory a
`next dev` server already had open corrupted that dev server's served chunks
(404s on `main-app.js`/`layout.css`/etc., a 500 on `/me`) until it was
restarted — confirmed by killing the stale process, clearing `apps/web/.next`,
and starting a fresh `next dev`, which immediately resolved it. Not a new
known issue (a `turbo build`/`next dev` sequencing caveat for whoever runs
both against the same checkout locally, not a code defect), but worth noting
here so a future session recognizes the symptom immediately rather than
re-diagnosing it.

Follow-up: CR-020 (Close registration) is next per `docs/tasks.md`'s Rides
section order.

## 2026-09-14 — CR-089 + CR-020 — Open + close registration

User asked to continue per the already-documented plan. Next unchecked ticket
was CR-020 ("Close registration"), but its natural source state
(`registration_open`) was unreachable — the CR-019 session had already
flagged this as KI-025: no ticket transitioned a ride into
`registration_open` at all. KI-025's own "next action" named two options
(fold the transition into CR-020, or add a preceding ticket); chose the
latter, same precedent as CR-088 for KI-024 — added CR-089 ("Open
registration") to `docs/tasks.md`'s Rides section (next free CR number) and
built both in the same session, since CR-020 was untestable without CR-089
existing first.

`apps/api/src/modules/rides/rides.service.ts` gained `openRegistration`
(`published -> registration_open`) and `closeRegistration`
(`registration_open -> registration_closed`), each with the same ownership
resolution as `publishRide` (404 `ride_not_found` whether the ride doesn't
exist or belongs to a different organizer). Unlike `publishRide`, neither
gates on `emailVerified` — `.claude/rules/security.md` names only the
publish trigger, and there is no de-verification flow that could make an
already-published ride's organizer newly unverified; re-checking here would
guard against a state that cannot occur. Two new 409 codes, one per action
(`ride_registration_not_openable`/`ride_registration_not_closable`),
distinct from each other and from `publish`'s `ride_not_publishable` so
`apps/web` can branch without inspecting `detail` text. `apps/api/src/
modules/rides/rides.routes.ts` gained `POST /:id/open-registration` and
`POST /:id/close-registration`. No `packages/db` migration —
`registration_open`/`registration_closed` already existed in the
`ride_status` enum since CR-017.

`apps/web/src/features/organizer/rides/{api.ts,components/EditRideForm.tsx}`
gained the matching typed client calls and two status-conditional buttons on
`/organizer/rides/[id]/edit`: "Открыть регистрацию" while `published`,
"Закрыть регистрацию" while `registration_open` — same pattern CR-019
established for "Опубликовать" (no confirmation dialog, same
duplicate-submit-protection discipline). `packages/ui/src/terminology.ts`'s
`RIDE_EDIT_TERMS` gained the six new labels/messages.
`.claude/context/known-issues.md`'s KI-025 is resolved.

Files: `packages/types/src/api/rides.ts`, `apps/api/src/modules/rides/
{rides.service.ts,rides.routes.ts,rides.routes.test.ts}`, `apps/web/src/
features/organizer/rides/{api.ts,components/EditRideForm.tsx,rides.test.tsx}`,
`packages/ui/src/terminology.ts`, `docs/api.md`, `docs/tasks.md`,
`.claude/context/known-issues.md`.
Decisions: none new — resolves KI-025 per its own documented options, no ADR
needed.

Validation: `turbo run typecheck lint test build` (all 25 tasks, run against
a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
Docker Desktop still unavailable in this environment) green. `apps/api`
gained 12 new tests (92 total, was 80); `apps/web` gained 4 new tests (63
total, was 59). `format:check`/`lint:root` clean (two `docs/tasks.md` list
items were reworded, not just reflowed, to avoid a real Prettier markdown
proseWrap instability — an inline code span split across a list-item
continuation line converged to a different indentation on every successive
`--write` pass; fixed by rewording those two bullets to keep each inline
code span on one line, not by fighting the formatter). Live-verified via curl
against a real Postgres + running `apps/api`, both endpoints in sequence on
one ride (register → verify → login → create organizer profile → create
draft ride): 401 (no cookie) → 404 (non-existent id) → 409
`ride_registration_not_openable` (still `draft`) → publish → 404 (a second
registered organizer's ride) → 200 `open-registration` happy path → 403 CSRF
(mismatched `Origin` on `close-registration`) → 200 `close-registration`
happy path (cross-checked against a direct `SELECT` — `status`/`updated_by`
correct at every step) → 409 `ride_registration_not_closable` (closing an
already-closed ride). Full browser walkthrough via the `browser-automation`
skill against a real `next dev` server + the already-running `apps/api`:
logged in as a fresh organizer with a `published` ride, confirmed "Открыть
регистрацию" (and no close button) on the edit screen, clicked it, confirmed
via `page.waitForResponse` the `POST .../open-registration` response was
`200`, the success message and "Регистрация открыта" badge appeared and the
button flipped to "Закрыть регистрацию"; clicked that, confirmed `POST
.../close-registration` was `200`, the success message and "Регистрация
закрыта" badge appeared with no action button remaining — screenshot taken
and visually confirmed. No console errors during the flow itself (two
unrelated `ERR_ABORTED` network entries were ordinary Next dev HMR/RSC
prefetch noise from the initial page load, not part of the feature). Test
accounts/rides deleted from the scratch DB afterward.

Follow-up: CR-021 (Cancel ride) is next per `docs/tasks.md`'s Rides section
order.

## 2026-09-15 — CR-021 — Cancel ride

Summary: `POST /v1/rides/:id/cancel` (`apps/api/src/modules/rides`), the only
lifecycle transition with three valid source statuses at once
(`docs/product.md`'s Lifecycle: `published/registration_open/
registration_closed -> cancelled`) — one new 409 code, `ride_not_cancellable`,
covers every other status (`draft`/`started`/`finished`/already-`cancelled`).
Same ownership rules as every prior transition (404 `ride_not_found` whether
the id doesn't exist or belongs to a different organizer), no `emailVerified`
gate (same reasoning as `open-registration`/`close-registration`). No
`packages/db` migration — `cancelled` already existed in the `ride_status` pg
enum since CR-017. `packages/ui`'s `Button` gained a new `danger` variant
(`docs/design.md`'s one bright-red exception to the calm palette, additive —
`variant` still defaults to `primary`). `/organizer/rides/[id]/edit` gained a
red "Отменить заезд" button (rendered for the three cancellable statuses),
guarded by a native `window.confirm()` — a deliberate departure from CR-019/
CR-020's "no confirmation, no Dialog component yet" precedent: cancellation is
the one lifecycle step with no forward continuation and the one status
`docs/design.md` explicitly singles out as needing to stay visually
impossible to miss, so a plain `confirm()` (no new component, no new
dependency) is a proportionate safeguard against a one-click irreversible
action.
Files: `packages/types/src/api/rides.ts`, `apps/api/src/modules/rides/
{rides.service.ts,rides.routes.ts,rides.routes.test.ts}`,
`packages/ui/src/components/Button.tsx`, `packages/ui/src/terminology.ts`,
`apps/web/src/features/organizer/rides/{api.ts,components/EditRideForm.tsx,
rides.test.tsx}`, `docs/api.md`, `docs/tasks.md`.
Decisions: none new — no ADR needed (additive `Button` variant, no schema/
architecture change).
Validation: `turbo run typecheck lint test build` (all 19 tasks run, some
cached) against a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/
coffee_ride_dev` (Docker Desktop still unavailable in this environment):
green. `apps/api` gained 8 new tests (100 total, was 92 — 401/404×2/409/
200×3-one-per-source-status/403); `apps/web` gained 6 new tests (69 total,
was 63). `format:check`/`lint:root` clean. Live-verified via curl (register →
verify → login → create organizer profile → three draft rides taken to
`published`/`registration_open`/`registration_closed` respectively, each
cancelled with a `200` and `status: 'cancelled'`, cross-checked against a
direct `SELECT`; a fourth fresh draft rejected with `409
ride_not_cancellable`; a second organizer's attempt on that same draft `404
ride_not_found`; mismatched `Origin` `403 csrf_origin_mismatch`) and a full
browser walkthrough via the `browser-automation` skill against a real `next
dev` server + a running `apps/api` (login → organizer profile → create ride →
publish → click "Отменить заезд" → native `confirm()` dialog intercepted and
accepted → success message "Заезд отменён." and "Отменён" badge appeared,
every field/button now disabled/absent) — cross-checked against a direct DB
read (`status`/`updated_by` correct). No console errors beyond the expected
benign `organizers/me` 404 (no profile yet, same pattern documented since
CR-015). Test accounts/rides deleted from the scratch DB afterward.
Follow-up: CR-022 (Finish ride) is next per `docs/tasks.md`'s Rides section
order — the last remaining lifecycle transition before CR-023 (Ride detail,
participant-facing).

## 2026-09-15 — CR-090 + CR-022 — Start + Finish ride

Summary: resolved KI-027 (opened this session — no ticket transitioned a ride
into `started` at all, same shape of gap as KI-024/KI-025) by adding CR-090
("Start ride") to `docs/tasks.md`'s Rides section and building it together
with CR-022 ("Finish ride"), since CR-022 had no reachable source state
without it. `POST /v1/rides/:id/start` (`registration_closed -> started`) and
`POST /v1/rides/:id/finish` (`started -> finished`, the lifecycle's terminal,
non-cancelled state), both in `apps/api/src/modules/rides`. Same ownership
rules as every prior transition (404 `ride_not_found` either way); neither
gates on `emailVerified` (only `publish` is named by
`.claude/rules/security.md`). Two new 409 codes, one per action:
`ride_not_startable`/`ride_not_finishable`. No `packages/db` migration — both
enum values already existed since CR-017. Before deciding to add CR-090,
checked whether `started` might instead be an automatic/time-based transition
(would have made `finish` correctly source from `registration_closed`
directly) — `docs/product.md`'s organizer-capabilities list omits "start" but
also omits "open/close registration" (both real, manual, separately-ticketed
actions from CR-089/CR-020), and no scheduled-job/cron infrastructure or
ticket exists anywhere in the repo, so the omission doesn't prove `start` is
non-manual; concluded the same "add the missing preceding ticket" fix as
KI-024/KI-025 was the right call. `apps/web`'s `/organizer/rides/[id]/edit`
gained two status-conditional buttons ("Начать заезд" while
`registration_closed`, "Завершить заезд" while `started`), no confirmation
guard — unlike `cancel`, both are forward-only steps with a further
continuation in the normal case. Reconfirmed by a new test (not just
inspection) that a `started` ride still correctly rejects `POST .../cancel`
with `409 ride_not_cancellable` — `CANCELLABLE_STATUSES` was already correct
from CR-021, `started` just wasn't reachable to exercise the path until now.
Files: `packages/types/src/api/rides.ts`, `apps/api/src/modules/rides/
{rides.service.ts,rides.routes.ts,rides.routes.test.ts}`,
`packages/ui/src/terminology.ts`, `apps/web/src/features/organizer/rides/
{api.ts,components/EditRideForm.tsx,rides.test.tsx}`, `docs/api.md`,
`docs/tasks.md`, `.claude/context/known-issues.md`.
Decisions: none new — resolves KI-027 per its own documented options, no ADR
needed (same precedent as CR-089/CR-020 resolving KI-025).
Validation: `turbo run typecheck lint test build` (19 tasks, mostly cached)
against a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/
coffee_ride_dev` (Docker Desktop still unavailable in this environment):
green. `apps/api` gained 13 new tests (113 total, was 100 — 6 for `start`,
6 for `finish`, 1 reconfirming `started` stays non-cancellable); `apps/web`
gained 5 new tests (74 total, was 69). `format:check`/`lint:root` clean —
one real (not cosmetic) fix needed: a `docs/tasks.md` bullet with a long
inline code span split across a list continuation line hit the same
Prettier markdown proseWrap instability CR-089/CR-020 already documented
(never converges under repeated `--write`); fixed by rewording the bullet to
keep the code span on one line, same resolution as that session, then
verified stable across two more `--write` passes. Live-verified via curl
against a real Postgres + the already-running `apps/api` (register → verify
→ login → create organizer profile → ride driven through
publish/open-registration/close-registration → `start`: 401/404/200/409
already-started, cross-checked against a direct DB read → `cancel` on the
now-`started` ride: 409 `ride_not_cancellable`, reconfirming CR-021's scope
→ `finish`: 200/409 already-finished → a second organizer's 404 on both
endpoints → 403 CSRF on both) and a full browser walkthrough via the
`browser-automation` skill against a real `next dev` server + `apps/api`
(login → `/organizer/rides/[id]/edit` on a `registration_closed` ride →
"Начать заезд" → 200, success message, button flipped to "Завершить заезд"
→ clicked it → 200, success message "Заезд завершён.", "Завершён" badge, no
action button remaining) — cross-checked against a direct DB read, 0 console
errors during the flow itself. Test accounts/rides deleted from the scratch
DB afterward.
Follow-up: CR-023 (Ride detail, participant-facing) is next per
`docs/tasks.md`'s Rides section order — the ride lifecycle is now fully
implemented end to end (`draft` through `cancelled`/`finished`).

## 2026-09-15 — CR-023 — Ride detail (participant-facing)

Summary: `GET /v1/rides/:id` (owner-only since CR-016/CR-018) now serves any
viewer — the ride's own organizer sees it at any status, anyone else
(including no session at all) sees it once it's left `draft` (`404
ride_not_found` either way, same resource-enumeration reasoning as before).
`apps/api/src/plugins/auth.ts` gained `resolveOptionalUser` (resolves the
session if present, never rejects — distinct from `requireAuth`).
`rides.service.ts`'s owner-only `getRideForOwner` was replaced by
`getRideForViewer`, which also joins `organizer_profiles` and returns the
ride's public `{ id, name }` on the response (`organizer`, additive
alongside the unchanged `ride` field) instead of a separate public
organizer-read endpoint — `docs/product.md` Principle 2, "complete ride
record, not a link out." `apps/web` gained its first fully public feature
module, `features/participant/ride-detail/`, and its first top-level route
with no `CabinetShell`/auth gate, `/rides/[id]` — shows cover (if set)/
title/status badge/organizer name/description/start date-time (in the
ride's own zone)/whichever of distance/elevation/pace/duration/difficulty
are set/price/participant limit, omitting rather than em-dashing anything
still `null`. Route/stops/services/requirements/registration action have no
data model yet (CR-027..036) and no discovery screen links here yet
(CR-024) — recorded as new KI-028, not silently skipped.
Files: `apps/api/src/plugins/auth.ts`; `apps/api/src/modules/rides/
{rides.service.ts,rides.routes.ts,ride-response.schema.ts,
rides.routes.test.ts}`; `packages/types/src/api/rides.ts`;
`packages/ui/src/terminology.ts`; `apps/web/src/features/participant/
ride-detail/{api.ts,components/RideDetailView.tsx,ride-detail.test.tsx}`;
`apps/web/src/app/rides/[id]/page.tsx`; `docs/api.md`; `docs/tasks.md`;
`.claude/context/known-issues.md`.
Decisions: none new — `.claude/context/current-task.md`'s "Investigation
before deciding scope" documents merging the public/owner read into one
endpoint (vs. a second endpoint at a different path) and why `cancelled`
stays publicly visible ("published+" means "left draft," not "never
cancelled"), per `.claude/rules/extensibility.md`'s contract-change-check
discipline — no existing caller (`EditRideForm`, always the owner) is
affected.
Follow-up: CR-024 (Ride list/public discovery) is next — nothing yet links
into `/rides/[id]` from within the app (KI-028). CR-027..031 (route/stops/
services/requirements) and CR-032..036 (registration) each extend this
screen further once their data models exist.
Validation: `turbo run lint typecheck build test` (25 tasks) against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
(Docker Desktop still unavailable): green. `apps/api` gained/replaced tests
in the `GET /v1/rides/:id` block (116 total, was 113); `apps/web` gained 4
new tests (78 total, was 74). `format:check`/`lint:root` clean (two files
needed a `prettier --write` pass — this file's own task-tracking docs,
cosmetic only). Live-verified via curl against a real Postgres + a running
`apps/api` (draft ride: 404 with no cookie, 200 with the owner's cookie;
non-existent id: 404; malformed id: 400; published ride: 200 with no cookie
at all, `organizer` cross-checked against a direct DB read) and a full
browser walkthrough via the `browser-automation` skill against a real `next
dev` server + `apps/api` (unauthenticated: published ride renders every
field correctly formatted — 42,3 км / 350 м / 24,5 км/ч / 2 ч 30 мин /
"Средний (уровень 3 из 5)" / 500 ₽ / 20 — 0 console errors, 0 failed
requests; a non-existent id renders the not-found state, not a crash, with
only the expected 404 fetch itself in the console). Test account/ride
deleted from the scratch DB afterward.

## 2026-09-15 — CR-024 — Ride list (public discovery)

Summary: `GET /v1/rides` (`apps/api/src/modules/rides`), the collection root
under the existing `ridesRoutes` prefix — fully public, no `preHandler` at
all (`docs/api.md` already committed to "no auth" for this endpoint before
this session). Same "published+" rule CR-023 established for the single-ride
endpoint: every status except `draft` (`cancelled`/`finished` included).
New `listPublicRides` in `rides.service.ts` — same cursor pagination and
`(createdAt desc, id desc)` sort key as CR-088's `/mine` (`apps/api/src/lib/
cursor.ts`'s docstring had already anticipated this endpoint reusing it),
joins `organizer_profiles` like `getRideForViewer` so each item carries
`organizer: { id, name }`, same reasoning as CR-023 (`docs/product.md`
Principle 2, no separate public organizer-read endpoint). `packages/types`
gained `PublicRide`/`ListPublicRidesResponse`; `ride-response.schema.ts`
gained `rideWithOrganizerResponseSchema` (`rideResponseSchema.extend`).
`apps/web` gained its second fully public feature module,
`features/participant/discovery/` (`api.ts`, `components/{RideCard,
DiscoveryList}.tsx`) — `RideCard` is deliberately feature-local, not
`packages/ui`, per `docs/design.md` §9's component inventory. `RideCard`
shows title/`StatusBadge`/organizer name/start date-time/the canonical
"first three" metrics (distance/elevation/pace, never duration, per
`docs/design.md` §6) omitting whichever is `null`/price, links to
`/rides/[id]` (CR-023) — closing half of KI-028 ("no discovery entry point
links here yet"), the other half (route/stops/services/requirements/
registration on the detail screen itself) stays open. `apps/web/src/app/
page.tsx` replaces the CR-002 bootstrap placeholder with
`<DiscoveryList />` — this is `docs/design.md`'s `/` Discovery screen (the
list-only slice; map toggle is CR-026, filters are CR-025). No "load more"
control yet — same precedent CR-088's `/mine` list already established
(the API is already cursor-paginated for when a `Pagination` component
exists). `apps/web/src/app/page.test.tsx` (the CR-002 bootstrap smoke test)
removed — real behavioral coverage now lives in the new feature module's
`discovery.test.tsx`, same "no test file per top-level page" precedent
`/organizer`/`/me` already follow (their feature components carry the real
tests).
Sort-order decision documented in `.claude/context/current-task.md` and
recorded as new KI-029: `startsAt`-based ordering (arguably more useful for
"find a ride to join") was considered and rejected for this ticket — `asc`
would put old past rides before upcoming ones on page 1, `desc` is only
directionally better; neither has product-doc backing yet, so `createdAt
desc` (identical to `/mine`) was kept and the gap deferred to CR-025
("Filters").
Files: `apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,
ride-response.schema.ts,rides.routes.test.ts}`; `packages/types/src/api/
rides.ts`; `packages/ui/src/terminology.ts`; `apps/web/src/features/
participant/discovery/{api.ts,components/{RideCard.tsx,
DiscoveryList.tsx},discovery.test.tsx}`; `apps/web/src/app/page.tsx`
(replaced); `apps/web/src/app/page.test.tsx` (removed); `docs/api.md`,
`docs/tasks.md`, `.claude/context/known-issues.md`.
Decisions: none new — no ADR needed (additive endpoint reusing existing
cursor/organizer-embed patterns, no schema/architecture change).
Validation: `turbo run lint typecheck build test` (25 tasks) against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
(Docker Desktop still unavailable in this environment): green. `apps/api`
gained 4 new tests in a new `GET /v1/rides (public discovery, CR-024)`
block (120 total, was 116); `apps/web` gained 4 new tests in
`discovery.test.tsx` and lost 1 (the removed bootstrap smoke test) — 81
total, was 78. `format:check`/`lint:root` clean after one `prettier
--write` pass (cosmetic only). Live-verified via curl against a real
Postgres + a freshly started `apps/api` (empty-collection `200`; a draft
ride correctly excluded; six rides driven through every non-draft status —
`published`/`registration_open`/`registration_closed`/`started`/`finished`/
`cancelled` — all appeared with the correct `organizer`, cross-checked
against a direct DB read; `limit`/`cursor` pagination followed across a
real second page; a malformed cursor → `400 invalid_cursor`) and a full
browser walkthrough via the `browser-automation` skill against a real
`next dev` server + `apps/api` (unauthenticated: `/` rendered both a
`published` and a `cancelled` test ride as cards with correct title/status/
organizer/metrics/price, the draft ride did not appear anywhere on the
page; clicked into the published card, correctly navigated to
`/rides/[id]` and rendered its full detail — 0 console errors, 0 failed
requests). Test accounts/rides deleted from the scratch DB afterward.
Follow-up: CR-025 ("Filters") is next per `docs/tasks.md`'s Rides section
order — also the ticket that should resolve KI-029's ordering gap.

## 2026-09-15 — CR-025 — Filters (public discovery)

Summary: `bicycleType` is the one filter dimension this ticket ships —
`GET /v1/rides?bicycleType=road|gravel|mtb|any` narrows the discovery list;
omitted returns every type. `packages/types` gained
`listPublicRidesQuerySchema` (`listRidesQuerySchema.extend`)/
`ListPublicRidesQuery`; `/mine` keeps the unextended schema, this filter is
discovery-only. Also resolves KI-029 (opened by CR-024, explicitly deferred
here): `listPublicRides` now makes "upcoming" (`startsAt >= now`, computed
fresh per call) an unconditional part of the endpoint, not a toggleable
filter — no named use case exists for browsing past rides from `/`
(`docs/product.md` Principle 3). With past rides excluded outright,
`startsAt asc` (soonest-first) is now the correct default sort, distinct
from `/mine`'s unchanged `createdAt desc`. `apps/api/src/lib/cursor.ts`'s
`CursorKey` field was generalized from `createdAt` to the neutral
`sortValue` (an internal rename only — the cursor is opaque and never
parsed client-side, ADR-011) so both endpoints' cursor pagination can share
the same helper while sorting by different columns.
`apps/web` gained `features/participant/discovery/components/
RideFilters.tsx` — a plain native `<select>`, not a new `packages/ui`
primitive (KI-020 stays open; no shared `Select` exists yet and one
feature-local dropdown doesn't need it). `DiscoveryList` holds the selected
`bicycleType`, refetches on change, and now renders two distinct empty
states: the existing unfiltered `emptyTitle` ("Пока нет заездов") and a new
filtered one, `emptyFilteredTitle` ("Пока нет заездов по этим фильтрам")
with a "Сбросить фильтры" reset action — exact copy `docs/design.md` §10
and `EmptyState`'s own doc comment already quoted verbatim since CR-066,
before any filter existed to use it.
Files: `apps/api/src/lib/cursor.ts`; `apps/api/src/modules/rides/
{rides.service.ts,rides.routes.ts,rides.routes.test.ts}`; `packages/types/
src/api/rides.ts`; `packages/ui/src/terminology.ts`; `apps/web/src/
features/participant/discovery/{api.ts,components/{RideFilters.tsx (new),
DiscoveryList.tsx},discovery.test.tsx}`; `docs/api.md`, `docs/tasks.md`,
`.claude/context/known-issues.md`.
Decisions: none new — no ADR needed (additive query param + an internal,
opaque-cursor field rename; no schema/architecture change). The "upcoming
only, unconditional" behavior change is documented in
`.claude/context/current-task.md`'s investigation as the deliberate
resolution KI-029 asked for, not an incidental side effect.
Validation: `turbo run lint typecheck build test` (25 tasks) against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
(Docker Desktop still unavailable): green. `apps/api`'s `GET /v1/rides`
block gained 2 tests (past-ride exclusion, bicycleType filter) and had its
pagination test rewritten for the new soonest-first sort — 122 total, was 120. `apps/web` gained 2 new tests in `discovery.test.tsx` (filter refetch,
filtered-empty + reset) — 83 total, was 81. `format:check`/`lint:root`
clean after one `prettier --write` pass (cosmetic only). Live-verified via
curl against a real Postgres + a freshly started `apps/api` (a road ride
and a sooner gravel ride, both published and future, plus a third
published ride with a 2020 `startsAt`: unfiltered `GET /v1/rides` returned
exactly the two future rides, gravel before road — soonest-first, not
creation order; `?bicycleType=road` returned only the road one) and a full
browser walkthrough via the `browser-automation` skill against a real
`next dev` server + `apps/api` (unauthenticated: initial list rendered
soonest-first with the past ride absent; selecting "Горный (MTB)" showed
the filtered-empty state with a working "Сбросить фильтры" that restored
the full list; selecting "Шоссейный" showed only the road ride) — 0
console errors, 0 failed requests. Test accounts/rides deleted from the
scratch DB afterward.
Follow-up: CR-026 ("Map discovery") is next per `docs/tasks.md`'s Rides
section order. New KI-030 records that distance/difficulty/price/
date-range filters remain deferred (no design-doc backing yet).

## 2026-09-15 — CR-026 / CR-084 — Map discovery + its geo-query decision

Summary: CR-084 ("Decide the geo query approach for map discovery") was
resolved together with CR-026 rather than as a separate prior session — same
precedent as ADR-013/CR-062. Decision (**ADR-014**, `docs/decisions.md`):
plain `numeric(9,6)` `startLat`/`startLng` columns on `rides`, not a PostGIS
geography type, with a map-viewport (bbox) filter as a plain range query
backed by a composite B-tree index — the current Postgres image
(`postgres:17-alpine`) has no PostGIS, and `docs/product.md`'s MVP scope
names only viewport markers, not true radius/proximity search. Only the
ride's _start_ point gets coordinates — no named use case shows a finish pin
on a discovery map (new KI-033).
`GET /v1/rides` gained an optional `?bboxNorth=&bboxSouth=&bboxEast=
&bboxWest=` filter (`packages/types`'s `listPublicRidesQuerySchema`, all
four required together — a partial bbox is `400 validation_error`); a ride
with no coordinates is excluded from a bbox-filtered result but stays
visible in the plain, unfiltered list (`.claude/rules/resilience.md`: "the
ride can still be created/viewed without geocoded coordinates").
`PATCH /v1/rides/:id` accepts `startLat`/`startLng` (must arrive together or
both be cleared together, same "arrive together" rule `startsAt`/
`startTimezone` already used) — entered manually in `EditRideForm`, since
`packages/maps-2gis`'s geocode adapter has no live-verified response shape
in this environment (KI-016, no `MAPS_2GIS_API_KEY` configured) and building
an address-lookup UI on top of it now would be unverifiable code (new
KI-032).
`apps/web`'s `/` gained a List/Map toggle (`DiscoveryViewToggle`,
`docs/design.md` §8). No `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` exists in this
environment either, so a real 2GIS MapGL render could not be built and
live-verified — there is no mock for "does a vendor map tile render in a
browser", unlike CR-007/CR-008's geocode adapter. Per `.claude/CLAUDE.md`'s
stop conditions ("the failure depends on an unavailable external
service/credential"), the map view instead renders `RideMapPlaceholder`
(`ErrorState`, `tone="warning"`, `variant="inline"` — the existing CR-066
degraded-state pattern) — a real, fully live-verified degraded state, not a
speculative, unverifiable live integration (new KI-031, blocked on KI-016).
`packages/maps-core`/`packages/maps-2gis` are unchanged by this ticket.
Files: `docs/decisions.md` (ADR-014); `packages/db/src/schema/ride.ts` +
migration `0005_polite_jimmy_woo.sql`; `packages/types/src/{domain/ride.ts,
api/rides.ts}`; `apps/api/src/modules/rides/{rides.service.ts,
ride-response.schema.ts,rides.routes.test.ts}`; `apps/web/src/features/
organizer/rides/{components/EditRideForm.tsx,rides.test.tsx}`;
`apps/web/src/features/participant/discovery/{components/
{DiscoveryViewToggle.tsx (new),RideMapPlaceholder.tsx
(new),DiscoveryList.tsx},discovery.test.tsx}`; three other tests' `Ride`/
`PublicRide` fixtures updated for the new required fields
(`ride-detail.test.tsx`); `packages/ui/src/terminology.ts`; `docs/api.md`,
`docs/tasks.md`, `.claude/context/known-issues.md`.
Decisions: ADR-014 (above) — the first ADR since ADR-013.
Validation: `turbo run lint typecheck build test` (25 tasks) against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`: all
green. `apps/api`'s rides suite gained 6 tests (bbox filter + no-coordinates
exclusion, partial-bbox rejection, coordinate persistence, paired-field
rejection, out-of-range rejection) — 152 total, was 126. `apps/web` gained 2
tests (coordinate save, map-toggle degraded state) — 87 total, was 85.
`format:check`/`lint:root` clean after one `prettier --write` pass
(cosmetic only). Live-verified via curl against a real Postgres + a freshly
started `apps/api`: three published rides (Moscow coordinates, Novosibirsk
coordinates, no coordinates) — a Moscow-area bbox returned only the Moscow
ride, excluding both Novosibirsk and the coordinate-less ride, while the
unfiltered list still included all three; a partial bbox and an
out-of-range/unpaired coordinate PATCH both returned `400
validation_error`. Live browser-verified via the `browser-automation` skill
against a real `next dev` server + `apps/api`: on `/`, clicking "Карта"
replaced the list with the degraded notice (list hidden), clicking "Список"
restored it, 0 console errors/failed requests; a full register → verify →
organizer-profile → create-ride → edit-ride walkthrough confirmed the
`Широта старта`/`Долгота старта` fields save and persist correctly
(`55.751244`/`37.618423` round-tripped exactly through reload). All test
accounts/rides deleted from the scratch DB by id/email afterward (a blanket
`DELETE FROM` was refused by the session's own safety classifier — scoped
deletes were used instead, same end state).
Known limitations: KI-031 (no live MapGL render), KI-032 (no geocode-by-
address UI), KI-033 (no finish-point coordinates) — all new, all recorded
with an explicit next action in `.claude/context/known-issues.md`.
Next logical task: the Route section (CR-027 "GPX upload") per
`docs/tasks.md`'s order — note its own prerequisite, CR-085 ("GPX parsing
must not block the event loop"), the same shape of gap CR-084 was for this
ticket.

## 2026-09-15 — CR-027 / CR-085 — GPX upload + its event-loop-safety decision

`docs/tasks.md`'s Route section, first ticket — CR-017..CR-026 (Rides) fully
done. Resolved CR-085 (event-loop-safety decision) together with CR-027, same
precedent as ADR-014/CR-026 and ADR-013/CR-062.

Decisions: ADR-015 (above) — 10 MB upload cap (`@fastify/multipart`) +
streaming SAX parse (`sax` package), no worker thread; revisit only if a real
perf problem is measured at scale. Also decided inline (not ADR-worthy,
recorded in `.claude/context/current-task.md`'s investigation): `Route`'s
GPX-parsed geometry lives in a single `jsonb` column, not a row-per-point
table (`RoutePoint` is a distinct, smaller concept — organizer-placed typed
markers, CR-031, not raw track points); `Route.distanceKm`/
`elevationGainMeters` (GPX-computed) are independent from `Ride`'s own
organizer-entered fields, not reconciled (new KI-034); download is served
through the API (`GET /v1/rides/:id/route/download`), not a public/pre-signed
bucket URL.

Database: new `routes` table (`packages/db/src/schema/route.ts`,
migration `0006_add_routes_table.sql`) — `id`, `rideId` (FK → `rides`,
`ON DELETE CASCADE`, unique — one route per ride), `gpxFileKey`/
`gpxFileName`/`gpxFileSizeBytes`, `distanceKm`/`elevationGainMeters`/
`pointCount` (computed at upload time), `geometry` (`jsonb`), `createdAt`/
`updatedAt`/`updatedBy`; CHECKs on every numeric column's lower bound.
Applied against the local scratch Postgres, live-verified.

API: `apps/api/src/modules/rides/gpx.ts` (new) — streaming SAX parser,
haversine distance sum, positive-elevation-delta sum, rejects a file with no
track points. `route-storage.ts` (new) — a small, module-scoped
timeout+bounded-retry wrapper around S3 PUT/GET/DELETE (CR-049, the shared
version of this, isn't built yet — same "minimal thing now" precedent as
every other module). `plugins/s3.ts` (new) — decorates `app.s3` from env,
`null` if unconfigured (not a boot failure). `POST`/`PATCH`/
`DELETE /v1/rides/:id/route` (multipart, `@fastify/multipart` — new
dependency, draft-only, same 404/409 ownership rules as `PATCH /v1/rides/
:id`) + `GET /v1/rides/:id/route/download` (new, not in the original
contract sketch — added to fulfill `docs/product.md`'s "downloadable track"
promise, same viewer-visibility rule as `GET /v1/rides/:id`). `GET
/v1/rides/:id` gained an additive `route: RouteSummary | null` field.

Found and fixed a real, pre-existing bug while building this (not a
workaround): `apps/api/src/plugins/error-handler.ts` unconditionally
redacted every `>=500` status to a generic `internal_error`/"Internal Server
Error" — correct for genuinely unexpected failures (a driver/DB error with
no `title` set), but CR-027's `route_storage_unavailable` (503) is the first
_deliberate_ domain error in this codebase with a status `>=500`, and the
old logic silently discarded its own safe, specific code/title/detail. Fixed
by keying the redaction on whether the error carries a `title` (the same
signal the `<500` branch already used to distinguish a domain error from a
raw thrown error) — a driver/DB failure (no `title`) is still fully
redacted; a deliberate `ServiceError` with a `>=500` status now passes
through its own safe code/title/detail, still logged loudly server-side
either way. Caught immediately by the new `route.routes.test.ts` suite's
storage-unavailable tests (500 instead of the expected 503), not left
undiscovered.

Web: new `apps/web/src/features/organizer/route/` feature module (ADR-009)
— `api.ts`, `RouteUploadForm.tsx` (loading/not-found/error/empty/success/
degraded states per `docs/design.md` §10; the degraded state reuses
`ErrorState tone="warning" variant="inline"`, exact copy "Загрузка
недоступна. Попробуйте ещё раз позже."). New `/organizer/rides/[id]/route`
screen; `EditRideForm` gained a "Маршрут →" link into it.
`packages/ui/src/terminology.ts` gained `RIDE_ROUTE_TERMS` +
`RIDE_EDIT_TERMS.routeLink`. `packages/types` gained `domain/route.ts`
(`RouteSummary`) and `GetRideResponse.route` (additive).

New dependencies: `sax` (streaming XML/GPX parser), `@fastify/multipart`
(file uploads) — both in `apps/api`.

Tests: 18 new `apps/api` tests (`route.routes.test.ts`, S3 mocked via
`vi.mock('@aws-sdk/client-s3')` — same technique CR-008 used for
`maps-2gis`'s `fetch`) + 7 new (`gpx.test.ts`, pure-function unit tests
against hand-built GPX fixtures) — 151 total, was 126. 10 new `apps/web`
tests (`route.test.tsx`) — 95 total, was 85. Two existing
`ride-detail.test.tsx` mocks updated for `GetRideResponse`'s new required
`route` field.

Validation: `turbo run lint typecheck test` and `turbo run build` (run
separately after a local `next build` — this repo's `web` package's
`typecheck` has no dependency on its own `build` completing, and Next.js's
`.next/types` generation races it when both are scheduled in one combined
`turbo run` invocation with a stale `.next` present locally; CI's
`ci.yml` already runs every task as its own sequential step and never hits
this) all green across all 8 packages. `format:check`/`lint:root` clean
after one `prettier --write` pass (cosmetic only, 9 files).

Live check: curl sequence against a real Postgres + a freshly started
`apps/api` with no `S3_*` configured — 401/404 (non-existent + stranger's
ride)/`gpx_invalid`/`ride_not_editable` (after publish)/`route_not_found`
(download with none uploaded) all as expected, and the upload itself
correctly returned `503 route_storage_unavailable` rather than a 500 or a
hang, with no orphaned `routes` row left behind (cross-checked with a direct
DB read — upload to S3 happens before the DB insert). Live browser-verified
via the `browser-automation` skill against a real `next dev` server +
`apps/api`: a fresh draft ride's route screen showed the empty state with a
working file input and upload button; selecting a GPX file and submitting
showed the degraded "Загрузка недоступна…" notice, not a crash; a
previously-published ride correctly hid the upload/replace/delete controls
and showed the draft-only notice instead. The one console error/failed
request in both walkthroughs was the expected 503 itself. All test
accounts/rides deleted from the scratch DB by id/email afterward.

Known limitations: KI-015 widened (S3 is now a real, tested-but-mocked-only
code path, not just a dormant client); new KI-034 (`Route`/`Ride` distance-
elevation figures not reconciled) and KI-035 (no full-geometry endpoint yet
for map/elevation-profile rendering) — both recorded with an explicit next
action in `.claude/context/known-issues.md`.

Next logical task: CR-028 ("Route rendering") — blocked on the same missing
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` credential as KI-031 for the map half, but
an elevation-profile chart from `Route.geometry` doesn't need 2GIS and could
ship independently; alternatively CR-029 ("Route metadata") to resolve
KI-034 deliberately, or CR-030/CR-031 (Stops/RoutePoint) which have no
dependency on CR-028 at all.

## 2026-09-15 — CR-028 — Route rendering

`docs/tasks.md`'s Route section, second ticket. Resolves KI-035 (full
`Route.geometry` exposure) and widens KI-031 (no live 2GIS MapGL credential)
to a second surface.

API: `apps/api/src/modules/rides/` gained `GET /v1/rides/:id/route/geometry`
— same viewer-visibility rule as `GET /v1/rides/:id`/`.../route/download`
(`resolveOptionalUser`: owner always, others only once the ride has left
`draft`), `404 route_not_found` if no route exists. No S3 call — unlike
`.../download`, the geometry is already in the `routes` row from CR-027's
upload, so there is no `route_storage_unavailable` case for this endpoint.
`packages/types` gained `RouteGeometryPoint` (domain) and
`GetRouteGeometryResponse` (API).

Web: `apps/web` gained its first real dependency on `packages/maps-core`
(`docs/design.md` §9: `ElevationProfile` "consumes `packages/maps-core`
types only") — no runtime code crosses the boundary, only the type-only
`LatLng` import, so KI-017 (raw-TS-source exports) doesn't apply. New
`features/participant/ride-detail/lib/elevation-profile.ts`: pure haversine
distance + evenly-spaced downsampling (cap 200 points — a real GPX track can
have thousands, ADR-015), computed at full resolution before downsampling so
the chart's x-axis stays faithful to the real path. New
`components/ElevationProfileChart.tsx`: hand-built inline SVG area chart
(no charting library added — same "hand-vendor something this simple"
discipline as KI-020's `Skeleton`/`Button`), matching `docs/design.md` §6's
full spec (muted `primary` fill at ~15% opacity, 1.5px stroke, y-axis floor
not forced to zero, pointer-move hover tooltip, `role="img"` +
descriptive `aria-label` as the chart's own accessible summary — the
"keyboard-accessible numeric alternative" the spec calls for is the existing
`MetricTile` distance/elevation figures elsewhere on the page, not a second
control on the chart itself). New `components/RouteMapPlaceholder.tsx`: a
second, independent instance of the same degraded `ErrorState` pattern
discovery's `RideMapPlaceholder` (CR-026) already established — a new
instance, not a shared import, per `.claude/rules/extensibility.md`'s
feature-module boundary (`features/participant/ride-detail/` may not reach
into `features/participant/discovery/`'s internals). `RideDetailView.tsx`
gained a "Маршрут" section, rendered only when `ride.route` (the existing
`RouteSummary`) is non-null; the geometry fetch runs in its own effect with
its own loading/error/retry state, independent of the ride's own load state,
so a route-render failure degrades locally instead of blanking the rest of
the already-loaded page (`.claude/rules/resilience.md`).
`packages/ui/src/terminology.ts` gained `ROUTE_RENDERING_TERMS`
(participant-facing — distinct from CR-027's organizer-facing
`RIDE_ROUTE_TERMS`).

Tests: 5 new `apps/api` tests (`route.routes.test.ts` — ownership/draft-
visibility/not-found/success for the new endpoint) — 156 total, was 151. 11
new `apps/web` tests (8 in a new `elevation-profile.test.ts` covering
haversine distance, downsampling, and the full profile-building pipeline
including a 5000-point downsampling case; 3 in `ride-detail.test.tsx` — the
section's absence with no route, its presence with a working chart/
placeholder, and the retryable degraded state on a geometry-fetch failure) —
106 total, was 95.

Validation: `turbo run lint typecheck test` (19 tasks, `--force` to bypass
cache) all green across all 8 packages, against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`.
`apps/web build`/`apps/api build`/`packages/types build`/`packages/maps-core
build` all green, run separately (same known local `turbo run build` +
stale-`.next` race as CR-027, not a regression, CI unaffected).
`format:check`/`lint:root` clean after one `prettier --write` pass (cosmetic
only, 6 files). Live check via curl against a real Postgres + a freshly
started `apps/api`: the new endpoint's full viewer-visibility contract
verified end to end — `404 ride_not_found` for a non-existent id, `404
route_not_found` for an owned ride with no route (including immediately
after an upload attempt that itself 503'd on unconfigured S3 — no orphaned
row), and, once a route row existed (inserted directly, since MinIO stays
unreachable in this environment — KI-015, same standing constraint), `200`
with the exact stored points for the owner on a draft ride, `404
ride_not_found` for a stranger on that same draft ride, and `200` for both
the stranger and an unauthenticated request once the ride was published.
Live browser-verified via the `browser-automation` skill against a real
`next dev` server + `apps/api`: `/rides/[id]` for the published ride showed
the "Маршрут" heading, the degraded map notice text, and a real elevation
chart (`svg[role=img]` with an accurate computed `aria-label`, 2 `<path>`
elements) — 0 console errors, 0 failed requests. All test data (route row,
ride, organizer profile, both test users) deleted from the scratch DB by id/
email afterward; both dev server processes stopped.

Known limitations: KI-035 resolved; KI-031 widened (second degraded-map
surface, same missing credential). No new issues.

Next logical task: CR-029 ("Route metadata") — resolves KI-034 (`Route`/
`Ride` distance-elevation reconciliation) deliberately; alternatively
CR-030/CR-031 (Stops/RoutePoint), which have no dependency on CR-028 or
CR-029.

## 2026-09-15 — CR-029 — Route metadata

`docs/tasks.md`'s Route section, third ticket. `docs/tasks.md` names it bare
("Route metadata") — its scope comes from KI-034, which explicitly names
this ticket as where to decide the `Route`/`Ride` distance-elevation
reconciliation deliberately.

Decision: two-part resolution rather than a single "pick one number" call —
(1) auto-fill for the common case: `POST /v1/rides/:id/route` (first upload
only) now fills whichever of `Ride.distanceKm`/`elevationGainMeters` is
still `null` from the GPX-computed values, independently per field, inside
the same DB transaction as the route insert (`db.transaction`, same pattern
`auth.service.ts` already uses) — an organizer who never manually entered a
figure never sees two numbers at all. Never overwrites an already-entered
value (the exact concern CR-027 flagged when it deliberately skipped this).
`PATCH .../route` (replace) does **not** auto-fill — by then `Ride`'s fields
already reflect something real, and re-filling on every replace would be
indistinguishable from always trusting the track. (2) explicit opt-in for
the remaining edge case: the organizer's own `/organizer/rides/[id]/route`
screen shows a reconciliation note with a "Использовать данные трека"
action when the two have genuinely diverged — reuses the existing `PATCH
/v1/rides/:id` (CR-018) directly, no new endpoint. `/rides/[id]`'s
participant-facing display is unchanged (still reads `Ride`'s fields, the
precedent CR-023/CR-028 already established — "the chart is an
illustration, the number is the fact," `docs/design.md` §6).

API: `apps/api/src/modules/rides/rides.service.ts`'s `uploadRoute` now wraps
its route insert in `db.transaction(...)`; within it, reads the ride's
current `distanceKm`/`elevationGainMeters` and conditionally `UPDATE`s only
the `null` ones. No schema change, no new endpoint, no ADR (a business-logic
policy decision, not an architecture change).

Web: `apps/web/src/features/organizer/route/api.ts`'s `getRideRouteState`
now also returns the ride's own `distanceKm`/`elevationGainMeters` (already
on the same `GET /v1/rides/:id` response, just not previously extracted);
new `syncRideMetricsFromRoute(rideId, metrics)` (own fetch, not imported
from `features/organizer/rides/` — `.claude/rules/extensibility.md`).
`RouteUploadForm.tsx` now reloads its full state (not just the mutation
response) after every upload/replace/sync, so its mismatch check always
reflects what the server actually did rather than a locally-guessed copy of
the auto-fill logic; a `hasMetricsMismatch` check (`rides.distanceKm`/
`routes.distanceKm` share the same `numeric(6,1)` precision server-side, so
a plain `!==` is exact) drives a new inline note + sync button, shown only
while the ride is still a draft (matching every other mutating control on
this screen). `packages/ui/src/terminology.ts`'s `RIDE_ROUTE_TERMS` gained
five new entries for this note.

Tests: 4 new `apps/api` tests (`route.routes.test.ts` — both-null auto-fill,
fill-only-the-unset-field, no-change-when-both-already-set, replace-never-
touches-ride) — 160 total, was 156. 3 new `apps/web` tests
(`route.test.tsx` — mismatch note + button shown, sync action adopts the
track's figures and clears the note, sync action hidden for a non-draft
ride) — 109 total, was 106.

Validation: `turbo run lint typecheck test --force` (19 tasks, all 8
packages) green against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`.
`apps/web build`/`apps/api build` both green. `format:check`/`lint:root`
clean after one `prettier --write` pass (cosmetic, one file). Live-verified
via curl against a real Postgres + a freshly started `apps/api`: a real
upload attempt correctly 503'd (S3 unreachable, KI-015) and left the ride's
fields untouched (transaction never partially applies); since a live upload
can't complete in this environment, a `routes` row was inserted directly to
exercise the reconciliation flow end to end — a manually-entered mismatch
was visible on `GET /v1/rides/:id`, and `PATCH` with the route's own values
(the sync button's exact action) resolved it. Live browser-verified via the
`browser-automation` skill against a real `next dev` server + `apps/api`
(same origin as `WEB_ORIGIN`, required for the CSRF check the sync button's
`PATCH` goes through): the mismatch note and button rendered correctly with
a real mismatch present; clicking it showed the success message and the
note disappeared — 0 console errors, 0 failed requests. All test data
deleted from the scratch DB by id/email afterward.

Known limitations: KI-034 resolved. No new issues.

Follow-up: CR-030 ("Stops") or CR-031 ("Route points") — neither depends on
CR-028/CR-029; `docs/tasks.md`'s order puts CR-030 first.

## 2026-09-15 — CR-030 — Stops

Summary: sixth domain table, `Stop` (`docs/database.md`: "named planned stop
with location and duration") — distinct from `Route` (the raw GPX polyline)
and the not-yet-built `RoutePoint` (CR-031). `POST`/`PATCH`/`DELETE
/v1/rides/:id/stops(/:stopId)`, draft-only (reuses `resolveOwnDraftRide`
verbatim — same gate as GPX upload, no new status code), plus an additive
`stops: Stop[]` array on `GET /v1/rides/:id` (no separate read endpoint,
same "embed it in the ride detail response" precedent as `route`, CR-027).
Organizer manages stops on the existing `/organizer/rides/[id]/route`
screen, alongside GPX upload (`docs/design.md` §8 groups them); a numbered
`StopList` on `/rides/[id]` shows them to participants.

Scope decisions (`.claude/context/current-task.md`): `lat`/`lng` are
required, not nullable — unlike `Ride.startLat/startLng`, a stop's entire
reason for existing is a location. `position` orders stops along the route;
it is server-assigned on create (current stop count for the ride, i.e.
appended at the end) and enforced unique per `(rideId, position)` at the DB
level — never client-supplied, and `PATCH` cannot change it. No
reorder/drag support in this ticket (no design-doc UI names one) — a stop
can only be appended or removed. One new error code, `stop_not_found`
(404), for a `PATCH`/`DELETE` on a nonexistent-or-wrong-ride stop id — same
resource-enumeration-safe shape as `route_not_found`.

Files: `packages/db/src/schema/stop.ts` (new) + migration
`0007_white_wong.sql`, `schema/index.ts` (+export); `packages/types/src/
domain/stop.ts` (new), `src/api/rides.ts` (+`createStopRequestSchema`/
`updateStopRequestSchema`, extended `GetRideResponse`), `src/index.ts`
(+export); `apps/api/src/modules/rides/` (`ride-response.schema.ts` +`stopResponseSchema`; `rides.service.ts` +`toStop`/`STOP_NOT_FOUND`/
`createStop`/`updateStop`/`deleteStop`, extended `getRideForViewer`;
`rides.routes.ts` +three routes, extended `rideDetailResponseSchema`; new
`stops.routes.test.ts`; `rides.routes.test.ts` +one assertion on the
additive field); `apps/web/src/features/organizer/route/` (`api.ts` +`createStop`/`updateStop`/`deleteStop`, new `components/
StopsSection.tsx`, wired into `RouteUploadForm.tsx`; `route.test.tsx` +5
tests, +`stops: []` on every existing mocked response); `apps/web/src/
features/participant/ride-detail/` (new `components/StopList.tsx`, wired
into `RideDetailView.tsx`; `ride-detail.test.tsx` +2 tests, +`stops: []` on
every existing mocked response); `packages/ui/src/terminology.ts`
(+`STOPS_TERMS`); `docs/api.md`, `docs/database.md`, `docs/tasks.md`.

Decisions: none new at the ADR level — the field-scope/position/draft-only
decisions above are ticket-level, same tier as CR-013's profile-field
scoping, recorded here and in `current-task.md`.

Known limitations: none new. Stops share the existing "no reorder" and
"draft-only" constraints other ride-configuration endpoints already have;
if a real need for either surfaces later (e.g. editing stops after
publish), that's a follow-up ticket, not silently done here.

Tests: 14 new `apps/api` tests (new `stops.routes.test.ts`) — 174 total,
was 160. 7 new `apps/web` tests (5 in `route.test.tsx`'s new `StopsSection`
suite, 2 in `ride-detail.test.tsx`) — 116 total, was 109.

Validation: `turbo run lint typecheck build test --force` (25 tasks, all 8
workspace members) green against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`.
`format:check`/`lint:root` clean after one `prettier --write` pass
(cosmetic, 9 files). Live-verified via curl against a real Postgres + a
freshly started `apps/api`: register → verify → login → create organizer →
create draft ride → create stop (position 0) → create second stop
(position 1) → `GET /v1/rides/:id` returned both in order → invalid `lat`
400 → `PATCH` rename 200 → `DELETE` 204 → repeat `DELETE` 404
`stop_not_found` → publish the ride → `POST .../stops` 409
`ride_not_editable` — the remaining stop cross-checked against a direct DB
read. Live browser-verified via the `browser-automation` skill against a
real `next dev` server + `apps/api`: added two stops through the form
(screenshotted — Tailwind styling, `Card`/`Button` components all render
correctly), edited one, deleted one, confirmed the participant-facing
`/rides/[id]` shows the remaining stop under a numbered "Остановки"
heading — 0 console errors throughout. All test data (rides/organizer
profiles/users) deleted from the scratch DB by id/email afterward.

Follow-up: CR-031 ("Route points" — the organizer-placed typed markers
distinct from `Stop`, per `docs/database.md`) is next per `docs/tasks.md`'s
Route section order.

## 2026-09-15 — CR-031 — Route points

Summary: seventh domain table, `RoutePoint` — organizer-placed typed markers
(`start`/`finish`/`stop`/`danger`/`water`/`food`/`technical`/`other`,
`docs/database.md`'s own list) along a ride's route, distinct from `Stop`
(named rest points with duration, shown in route order) and from
`Route.geometry` (the raw GPX polyline). Unlike CR-030, `docs/api.md` had no
pre-sketched endpoint shapes for this one — designed this session by close
analogy to the `Stop` precedent (same screen, same draft-only gate, same
"no separate read endpoint" embedding pattern).

Fields: `type` (required enum), `label` (optional, ≤140 chars — a marker's
own short name, since two markers can share a `type`), `description`
(optional, ≤500 chars), `lat`/`lng` (required, standard range — a marker's
whole reason for existing is a location). No `position`/reorder concept and
no per-type uniqueness constraint: unlike `Stop`, a route point is a typed
map pin meant to render by `type`, not an ordered itinerary entry, and a
real route can legitimately carry more than one marker of the same type
(e.g. two `water` points). Display order is `createdAt asc`.

New endpoints: `POST`/`PATCH`/`DELETE /v1/rides/:id/route-points[/:id]` —
same auth/ownership/draft-only gate as `.../stops` (`resolveOwnDraftRide`,
`409 ride_not_editable` once published), one new error code
(`route_point_not_found`, 404, same resource-enumeration-safe shape as
`stop_not_found`). `GET /v1/rides/:id` gained an additive `routePoints:
RoutePoint[]` field, same embedding precedent as `route`/`stops`.

Scope decision — no participant-facing UI: `docs/design.md` §8's
participant ride-detail row names "route + profile, stops, services,
requirements..." — no route-points list is named there (unlike `Stop`,
which got an explicit `StopList`). A route point is a map pin, and the map
itself is already a documented degraded placeholder pending a live 2GIS
credential (KI-031). Ships as API + organizer management UI
(`RoutePointsSection`, wired into the existing `RouteUploadForm` screen
alongside `StopsSection`) only; flagged forward as KI-036 rather than left
as a silent gap — the natural next step is plotting `routePoints` as map
markers once real MapGL rendering lands, not a new text list.

Files: `packages/db/src/schema/route-point.ts` (new, `route_point_type` pg
enum) + `schema/index.ts` + migration `0008_worthless_mesmero.sql`;
`packages/types/src/domain/route-point.ts` (new) + `src/index.ts`;
`packages/types/src/api/rides.ts` (+`createRoutePointRequestSchema`/
`updateRoutePointRequestSchema`, `GetRideResponse.routePoints`);
`apps/api/src/modules/rides/` (`ride-response.schema.ts` +`routePointResponseSchema`; `rides.service.ts` +`toRoutePoint`/
`ROUTE_POINT_NOT_FOUND`/`createRoutePoint`/`updateRoutePoint`/
`deleteRoutePoint`, extended `getRideForViewer`; `rides.routes.ts` +3
routes; new `route-points.routes.test.ts`, 14 tests); `apps/web/src/
features/organizer/route/` (`api.ts` +6 functions/types; new
`components/RoutePointsSection.tsx`, wired into `RouteUploadForm.tsx`;
`route.test.tsx` +5 tests, +`routePoints: []`/`[baseRoutePoint]` on every
mocked response); `packages/ui/src/terminology.ts`
(+`ROUTE_POINT_TYPE_TERMS`, +`ROUTE_POINT_TERMS`); `apps/web/src/features/
participant/ride-detail/ride-detail.test.tsx` (+`routePoints: []` on every
mocked response, no behavior change); `docs/api.md`, `docs/database.md`,
`docs/tasks.md`, `.claude/context/known-issues.md` (+KI-036).

Decisions: none new at the ADR level — the field-scope/no-position/no-
participant-UI decisions above are ticket-level, same tier as CR-030's own
scope decisions, recorded here and in `current-task.md`.

Known limitations: KI-036 (no participant-facing route-points UI yet,
deliberate — see above). No other new gap; `route_point_not_found` follows
the same resource-enumeration-safe precedent every other nested-resource
404 in this module already uses.

Tests: 14 new `apps/api` tests (new `route-points.routes.test.ts`) — 188
total, was 174. 5 new `apps/web` tests (new `RoutePointsSection` suite in
`route.test.tsx`) — 121 total, was 116.

Validation: `turbo run lint typecheck build test --force` (25 tasks, all 8
workspace members) green against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`.
`format:check`/`lint:root` clean after one `prettier --write` pass
(cosmetic, 3 files). Live-verified via curl against a real Postgres + a
freshly started `apps/api`: register → verify → login → create organizer →
create draft ride → create `start` point → create `water` point →
`GET /v1/rides/:id` returned both, `createdAt`-ordered → invalid `type`
400 → `PATCH` the `water` point to `danger` (clearing nothing else) 200 →
`DELETE` 204 → repeat `DELETE` 404 `route_point_not_found` → publish the
ride → `POST .../route-points` 409 `ride_not_editable` — the remaining
`start` point cross-checked against a direct DB read. Live browser-verified
via the `browser-automation` skill against a real `next dev` server +
`apps/api`: opened the add form, selected type "Опасный участок", filled
label/lat/lng, saved (screenshotted — Tailwind/`Card`/`Button` styling
matches `StopsSection`), confirmed the list entry read "Опасный участок ·
Крутой спуск", deleted it after confirming the browser dialog, confirmed
the empty state returned — 0 console errors, DB cross-checked empty after
delete. All test data (rides/organizer profiles/users) deleted from the
scratch DB afterward.

Follow-up: CR-031 was the last remaining Route-section ticket
(`docs/tasks.md`) — next up is the Registration section, starting with
CR-032 ("Register").

## 2026-09-15 — CR-032 / CR-033 / CR-034 / CR-035 — Register, cancel registration, capacity + duplicate protection

Summary: eighth domain table, `Registration` — a participant's registration
for a `Ride` (`docs/database.md`). Bundles four backlog tickets into one
change: CR-032 ("Register") and CR-033 ("Cancel registration") are the two
new endpoints; CR-034 ("Capacity enforcement") and CR-035 ("Duplicate
protection") are delivered as part of CR-032 rather than deferred —
`.claude/CLAUDE.md`/`.claude/rules/database.md` require registration to
_atomically_ protect availability/capacity/duplicates from the start, the
same "invariant baked in from day one" precedent CR-057 (password hashing,
inside CR-011) and CR-062 (session store, inside CR-012) already used.

New capability module, not folded into `rides`: unlike `Stop`/`RoutePoint`
(organizer-authored ride configuration, reusing `resolveOwnDraftRide`),
`Registration` is participant-initiated and explicitly named as its own
capability in `.claude/rules/architecture.md`'s Feature boundaries list —
new `apps/api/src/modules/registrations/`, its routes registered under the
same `/rides` prefix as `ridesRoutes` in `routes/v1.ts` (paths are
`/v1/rides/:id/register`; the URL shape is unaffected).

Fields: `rideId`/`userId` (FK, cascade), `status` (`active`/`cancelled`,
default `active`), `createdAt`/`updatedAt`, `cancelledAt` (nullable, set
only on cancel — CHECK-enforced consistency with `status`). Cancelling sets
`status`/`cancelledAt` rather than deleting the row (audit trail,
`.claude/rules/security.md`) and lets a participant re-register later — a
fresh row, not a resurrected one.

Atomicity mechanism: one `SELECT ... FROM rides WHERE id = $1 FOR UPDATE`
(the `rides` row only, not a join) inside `createRegistration`'s
transaction serializes every concurrent registration attempt for the same
ride — the second request waits for the first to commit, then sees its
committed state. That single lock makes the duplicate check
(`409 registration_already_exists`), the capacity check against
`participantLimit` (`409 ride_full`), and double-submit protection all
race-free at once, so there's no need to catch a DB constraint-violation
error on the hot path. A partial unique index
(`registrations_ride_id_user_id_active_unique`, `(rideId, userId) WHERE
status = 'active'`) is the DB-level invariant backstop per
`.claude/rules/database.md`, not a mechanism this code path relies on.
Visibility (`404 ride_not_found` for a non-existent ride or someone else's
still-`draft` one, same resource-enumeration-safe rule as `GET
/v1/rides/:id`) is resolved once before the lock; `registration_open`
status is re-checked a second time inside the lock, guarding the harmless
race where an organizer closes registration between the two checks.

Scope decision — full ride is a 409, not an auto-waitlist:
`WaitlistEntry` doesn't exist yet (CR-036, separate ticket).
`REGISTRATION_ACTION_TERMS.full` ("Мест не осталось") was already
pre-scaffolded in `packages/ui/src/terminology.ts` ahead of this ticket
(`.waitlisted` stays unused until CR-036). No extra gating on `DELETE
.../register` beyond "an active registration exists" — nothing in
`docs/product.md`/`docs/database.md` restricts cancellation to a
particular ride status, so none was invented.

New endpoints: `POST`/`DELETE /v1/rides/:id/register` — `requireAuth` (any
authenticated user, not just the ride's organizer). `GET /v1/rides/:id`
gained two additive fields: `registrationsCount` (active count) and
`viewerRegistration` (the caller's own active registration, `null` if none
or unauthenticated), resolved inline in `getRideForViewer` and reusing
`registrations.service.ts`'s `toRegistration` mapper rather than
duplicating it.

Web: `RegistrationButton` on `/rides/[id]` (participant ride detail) —
renders nothing unless the ride is `registration_open` or the viewer
already has an active registration (so cancel stays reachable even after
registration closes); shows the full/register/cancel state from
`viewerRegistration`/`registrationsCount`/`participantLimit`; redirects to
`/login` on a 401. The old bare-number "Лимит участников" tile was
replaced with `METRIC_TERMS.participants` + the pre-existing
`formatParticipantsParts` formatter, now showing a live "12 из 20" ratio.

Scope decision — not this ticket: `GET /v1/rides/:id/participants`
(CR-037, organizer-facing, needs its own response-minimization design);
waitlist (CR-036); "My registrations" (`/me/rides`) — no ticket owned it
(same shape of gap as KI-024/025/027), so a new ticket (CR-091) and a
`known-issues.md` entry (KI-037) were added rather than silently deferring
it; a participant can still see/cancel a registration today via the
specific ride's `/rides/[id]` page.

Files: `packages/db/src/schema/registration.ts` (new, `registration_status`
pg enum) + `schema/index.ts` + migration `0009_perpetual_junta.sql`;
`packages/types/src/domain/registration.ts` (new) + `src/index.ts`;
`packages/types/src/api/registrations.ts` (new, `CreateRegistrationResponse`);
`packages/types/src/api/rides.ts` (`GetRideResponse` +`registrationsCount`/
`viewerRegistration`); `apps/api/src/modules/registrations/` (new:
`registrations.service.ts`, `registration-response.schema.ts`,
`registrations.routes.ts`, `registrations.routes.test.ts` — 10 tests);
`apps/api/src/modules/rides/` (`rides.service.ts`'s `getRideForViewer`
extended; `ride-response.schema.ts`/`rides.routes.ts`'s
`rideDetailResponseSchema` extended); `apps/api/src/routes/v1.ts`
(+`registrationsRoutes`); `apps/web/src/features/participant/ride-detail/`
(`api.ts` +`registerForRide`/`cancelRideRegistration`; new
`RegistrationButton.tsx`, wired into `RideDetailView.tsx`;
`ride-detail.test.tsx` — every fixture gained `registrationsCount`/
`viewerRegistration`, +4 new tests for the button's states); `packages/ui/
src/terminology.ts` (`RIDE_DETAIL_TERMS` +`registrationActionError`, -the
now-unused `participantLimitLabel` key); `docs/api.md`, `docs/database.md`,
`docs/tasks.md` (+CR-091), `.claude/context/known-issues.md` (+KI-037).

Decisions: none new at the ADR level — the module-split/locking-mechanism/
no-auto-waitlist decisions above are ticket-level, recorded here and in
`current-task.md`.

Known limitations: KI-037 (no "My registrations" list yet, deliberate —
see above, CR-091 tracks it). No other new gap.

Tests: 10 new `apps/api` tests (new `registrations.routes.test.ts`) — 198
total, was 188. 4 new `apps/web` tests (new "registration action" suite in
`ride-detail.test.tsx`) — 125 total, was 121.

Validation: `turbo run lint typecheck build test --force` (25 tasks, all 8
workspace members) green against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
confirmed twice (once concurrently, where one `apps/web` test flaked from
machine resource contention — same known pattern noted in CR-031's own
validation — and once sequentially, fully green). `format:check`/
`lint:root` clean after one `prettier --write` pass (cosmetic, 6 files).
Live-verified via curl against a real Postgres + `apps/api`: organizer
creates a ride with `participantLimit: 1`, publishes, opens registration;
participant 1 registers (201); participant 2's registration is rejected
(409 `ride_full`); participant 1's duplicate registration is rejected (409
`registration_already_exists`); `GET /v1/rides/:id` as participant 1 shows
`registrationsCount: 1` and the matching `viewerRegistration`; participant
1 cancels (204); participant 2 then successfully registers into the freed
spot (201) — cross-checked against a direct DB read (one `cancelled` row
with `cancelledAt` set, one fresh `active` row). Live browser-verified via
the `browser-automation` skill against a real `next dev` server + `apps/api`
(the pre-existing dev server was serving a stale build and was restarted):
loaded `/rides/[id]` with a participant session cookie, clicked
"Зарегистрироваться", confirmed the button switched to "Отменить
регистрацию" and the participants tile went "0 из 10" → "1 из 10", clicked
cancel, confirmed the button reverted and the tile returned to "0 из 10" —
0 console errors; network capture showed the `POST`/`DELETE` requests
returning `201`/`204` correctly (one `net::ERR_ABORTED` reported against
the already-204'd `DELETE` request — a benign dev-server/browser teardown
artifact, not a functional failure, confirmed by the correct UI state and
DB row after). All scratch test data (rides/organizer profiles/users)
deleted from the DB afterward.

Follow-up: `docs/tasks.md`'s Registration section has CR-036 ("Waitlist"),
CR-037 ("Organizer participant list"), and the newly added CR-091 ("My
registrations") remaining.

## 2026-09-15 — CR-036 — Waitlist

Summary: ninth domain table, `WaitlistEntry` — a participant can join a full ride's
queue and leave it again; cancelling an active registration now atomically promotes
the oldest waiting entry into a fresh active registration, closing the gap CR-032
deliberately left open ("full ride → 409, not auto-waitlist").

Lives inside the existing `registrations` capability module rather than a new one
(`.claude/context/current-task.md`): promotion touches both `Registration` and
`WaitlistEntry` in one transaction, and keeping both concepts in the same module avoids
one module reaching into another's internals (`.claude/rules/resilience.md`).

`packages/db`: `waitlist_entries` (`rideId`/`userId` FKs cascade-delete, `status` pg
enum `waiting`/`promoted`/`cancelled` default `waiting`, `createdAt`/`updatedAt`
`timestamptz`, `cancelledAt`/`promotedAt` nullable with CHECK constraints tying each to
its status — same audit-trail discipline as `registrations.cancelledAt`). No `position`
column, unlike `Stop` — queue order is `createdAt` ascending, with no reordering use
case to justify a manual column. A partial unique index on `(rideId, userId) WHERE
status = 'waiting'` mirrors `registrations`' own duplicate-protection index — only one
waiting row per (ride, user) at a time, so leaving and rejoining the queue is a fresh
row, not a resurrected one. Migration `0010_nappy_speed.sql`, applied to the local
`coffee_ride_dev` scratch database.

`packages/types`: `WaitlistEntry`/`WaitlistEntryStatus`/`WAITLIST_ENTRY_STATUSES` (new
domain type), `CreateWaitlistEntryResponse` (new API type), `GetRideResponse` gained an
additive `viewerWaitlistEntry` field (the caller's own `waiting` entry, `null` if none/
unauthenticated/promoted/cancelled) — same embedding precedent CR-032 established for
`viewerRegistration`, deliberately no `waitlistCount` this ticket (nothing
participant-facing needs a total queue size; CR-037's organizer participant list is the
natural place for that if ever asked for).

`apps/api`: two new routes in the existing `registrations` module — `POST`/`DELETE
/v1/rides/:id/waitlist`. `joinWaitlist` reuses `createRegistration`'s `SELECT ... FOR
UPDATE` lock on the `rides` row, then re-derives capacity itself rather than trusting a
stale client-side `409 ride_full` — `409 ride_not_full` if there's still an open spot
or the ride has no `participantLimit` at all (an unlimited ride is never "full", so a
waitlist can never apply to it), `409 registration_already_exists` if the caller
already has an active registration, `409 waitlist_entry_already_exists` for a duplicate
join. `leaveWaitlist` mirrors `cancelRegistration`'s "no status gate beyond an entry
existing" discipline. The real new mechanism: `cancelRegistration` now opens a
transaction, locks the same `rides` row, cancels the registration, then looks up the
oldest `waiting` entry for that ride (`ORDER BY created_at ASC LIMIT 1`) and — if one
exists — marks it `promoted` (`promotedAt` set) and inserts a brand-new active
`Registration` for that user, all inside the one transaction. This is what makes
"waitlist consistency" atomic with the cancellation that caused it
(`.claude/rules/database.md`/`.claude/rules/resilience.md`), not a separate step that
could observe a stale state. `GET /v1/rides/:id` gained the additive
`viewerWaitlistEntry` field described above. 14 new Vitest tests (join happy path,
`ride_not_full` for both an open-spot ride and an unlimited one, `registration_already_
exists`, `waitlist_entry_already_exists`, draft-non-owner/unauthenticated → 404/401,
leave happy path + rejoin, `waitlist_entry_not_found`, and two auto-promotion tests —
one confirming FIFO order across three participants, one confirming a cancellation with
no one waiting is a no-op).

`packages/ui`: `REGISTRATION_ACTION_TERMS` gained `joinWaitlist` ("Встать в список
ожидания") and `leaveWaitlist` ("Покинуть список ожидания") — `docs/design.md` §13's
fixed four-term Registration list didn't anticipate a separate join/leave
call-to-action (only the `waitlisted` state label and the now-unused `full` label), so
both new terms were appended to that list rather than reusing `waitlisted` for a CTA it
doesn't semantically fit ("you are on the waitlist" vs. "join the waitlist" are
different statements). `full` ("Мест не осталось") is now unused in code but left
defined — `docs/design.md` still names it, and removing a defined term isn't this
ticket's call to make unilaterally.

`apps/web`: `RegistrationButton` gained a third state — full + no viewer registration/
waitlist entry shows an active "Встать в список ожидания" button (previously a
disabled "Мест не осталось" placeholder, since no waitlist existed yet); a waiting
entry shows the disabled "waitlisted" label plus a "Покинуть список ожидания" button,
rendered even once registration has closed (same "stays available" rule cancel already
followed). `RideDetailView` plumbs `viewerWaitlistEntry` through. One real correctness
fix made along the way, not shipped as a latent bug: cancelling a registration used to
optimistically decrement `registrationsCount` locally, which is now wrong whenever the
cancellation silently promotes someone else into the freed spot server-side (the count
doesn't actually drop) — `onChange`'s cancel branch now refetches the ride detail
instead of guessing, while the register branch keeps its safe optimistic increment
(registering never has this side effect on anyone else's count). 10 new/updated
`apps/web` tests (the old "disabled full state" test was replaced, not just left
alongside a new one, since the behavior it asserted no longer exists).

Validation: `turbo run lint typecheck build test --force` — 25/25 tasks green across
all 9 workspace members. `apps/api`: 212 tests (was 198, +14). `apps/web`: 126 tests
(was 125, net +1 after replacing the obsolete "full" test and adding two new ones).
`packages/ui`: unchanged at 85 tests — `terminology.test.ts`'s existing fixed-object
assertion was updated in place for the two new terms, not a new test case.
`pnpm format:check`/`lint:root` clean. One environment
gotcha hit and resolved, not a code defect: sourcing the root `.env` (which sets
`NODE_ENV=development`, needed for `apps/api`'s dev server) into the same shell before
running `next build` makes the production build crash during static export
(`<Html> should not be imported outside of pages/_document`, on `/404`/`/_error`) —
confirmed this reproduces identically on `main` before any of this session's changes,
so it's a pre-existing environment quirk, not a regression; the fix is simply not
carrying a `development`-valued `NODE_ENV` into a `next build` invocation
(`NODE_ENV=production pnpm --filter web build`), not a code or dependency change.

Live-verified via curl against a real Postgres + `apps/api`: organizer creates a ride
with `participantLimit: 1`, publishes, opens registration; participant 1 registers
(201, fills the only spot); participant 2's registration is rejected (409 `ride_full`);
participant 2 joins the waitlist (201); participant 3 joins the waitlist too (201);
participant 2's duplicate join is rejected (409 `waitlist_entry_already_exists`); ride
detail as participant 3 shows `registrationsCount: 1` and their own `waiting` entry;
participant 1 cancels (204) — ride detail as participant 2 now shows an active
`viewerRegistration` and `viewerWaitlistEntry: null` (promoted), while participant 3
still shows `viewerWaitlistEntry` with `status: 'waiting'` (not promoted — FIFO order
respected); participant 3 leaves the waitlist (204), then a second leave attempt
correctly 404s (`waitlist_entry_not_found`). All scratch test data (rides/users) deleted
from the DB afterward, confirmed by a direct count query.

Files: `packages/db/src/schema/waitlist-entry.ts` (new) + migration
`0010_nappy_speed.sql`, `schema/index.ts`; `packages/types/src/domain/
waitlist-entry.ts` (new), `src/api/{registrations,rides}.ts`, `src/index.ts`;
`apps/api/src/modules/registrations/` (new: `waitlist-entry-response.schema.ts`;
extended: `registrations.service.ts` — `toWaitlistEntry`/`joinWaitlist`/
`leaveWaitlist`, `cancelRegistration` promotion logic; `registrations.routes.ts`;
`registrations.routes.test.ts`), `apps/api/src/modules/rides/{rides.service,
ride-response.schema,rides.routes}.ts` (additive `viewerWaitlistEntry`);
`packages/ui/src/terminology.ts` + `terminology.test.ts` (two new terms);
`apps/web/src/features/participant/ride-detail/{api,ride-detail.test}.tsx`,
`components/{RegistrationButton,RideDetailView}.tsx`; `docs/{api,database,design,
tasks}.md`, `.claude/context/{project-state,current-task}.md`.

Decisions: none new at the ADR level — this implements `docs/product.md` MVP #8
("waitlist") and the organizer capability "manage registrations and waitlist" already
named there; no schema/API-contract pattern was invented beyond what `Registration`
(CR-032) already established.

Known limitations: none new. CR-037 ("Organizer participant list") still needs its own
waitlist-visibility design (a `WaitlistTable`, `docs/design.md` line 260/282) — not
reused from this ticket's participant-only shape. CR-038/039 (Communication section)
still own actually notifying a promoted participant; today they only find out by
revisiting `/rides/[id]`.

Follow-up: `docs/tasks.md`'s Registration section has CR-037 ("Organizer participant
list") and CR-091 ("My registrations") remaining.

## 2026-09-15 — CR-037 — Organizer participant list

Summary: two new organizer-only, cursor-paginated collection endpoints —
`GET /v1/rides/:id/participants` (active registrations, `createdAt asc`) and
`GET /v1/rides/:id/waitlist` (adds a `GET` to the existing `POST`/`DELETE` path —
the organizer's own collection view of the same resource; `waiting` entries only,
exact FIFO order). Neither is draft-only — an organizer needs this view most _after_
publishing, once real registrations exist — so ownership is checked with a new
`assertOwnRide` helper (same resource-enumeration-safe `404 ride_not_found` pattern
every other organizer-only endpoint already uses), not the draft-only
`resolveOwnDraftRide` gate stops/route-points/GPX upload use.

Own response shape, not `Registration`/`WaitlistEntry`: `RideParticipantSummary`
(`packages/types`) is deliberately minimal — `id`/`userId`/`displayName`/`createdAt`,
no phone/email. `.claude/rules/security.md` ("protect participant contact...
information", "never return unnecessary participant data") and
`packages/db/src/schema/user.ts`'s own comment on `phone` ("returned only to the
profile's own owner... this is the constraint to preserve once [another endpoint
exposes another user's row] does") both point at exactly this endpoint — no product
doc names a "contact participant" feature yet (that's Communication section,
CR-038+, via in-app notifications, not a phone number). One shape reused for both
endpoints' items — the fields needed are identical, only the server-side filter
differs.

Real bug found and fixed while building this, not shipped as a latent one:
`apps/api/src/lib/cursor.ts`'s established pattern (`JS Date.toISOString()` as the
cursor's `sortValue`, compared with `>`/`<` against the raw DB column) silently
assumed millisecond precision on both sides, but Postgres stores `timestamptz` at
microsecond precision — a `Date` truncates that away. For **descending** order
(`/mine`'s existing `<` comparison) this is harmless: a row's own truncated cursor
is never less than its actual stored value, so the row's `<` check against itself
comes out false, as intended. For **ascending** order — this ticket's `createdAt
asc` (needed for "oldest first"/FIFO semantics) is the _first_ endpoint to combine
ascending order with a `now()`-derived, microsecond-precision column (the existing
ascending case, `GET /v1/rides`'s `startsAt`, has no sub-second entropy, so it never
triggered this) — the truncated cursor is always strictly less than the row's own
actual value, so that row always matches its own `>` condition and pagination never
advances past page one. Confirmed empirically against a real Postgres (a temp-table
insert + round-trip comparison) before fixing, not just reasoned about. Fixed
locally in `registrations.service.ts`'s two new queries by wrapping the _column_
side in `date_trunc('milliseconds', ...)` too, so both sides of the comparison are
truncated to the same precision consistently — the general `cursor.ts` contract and
every other consumer are untouched (out of scope for this ticket; `/mine` and
`GET /v1/rides` are unaffected by construction, per the reasoning above).

New `/organizer/rides/[id]/participants` screen (`apps/web`, `docs/design.md` §8/§9):
`ParticipantTable` and `WaitlistTable` — the two named components the design doc's
component inventory already listed — each with independent loading/empty/error
states, rendered as stacked cards (never a table, `docs/design.md` §11's mobile
rule). The waitlist shows a `1.`/`2.`/... position number from the returned array's
own order — no stored/computed position field, same "order is `createdAt asc`, kept
as row order" reasoning CR-036 already established for `WaitlistEntry` itself. No
"load more" pagination UI — same precedent `RidesList`/`DiscoveryView` already set;
the API is correctly paginated per ADR-011 for whenever a screen needs it. Linked
from `EditRideForm` via a new "Участники →" link next to the existing "Маршрут →"
one.

Validation: `turbo run lint typecheck build test --force` (build with
`NODE_ENV=production` per KI-038's documented workaround) green across all touched
workspaces. `apps/api`: 221 tests (was 212, +9 — 6 for `/participants`, 3 for
`/waitlist`'s organizer view). `apps/web`: 131 tests (was 126, +5, new
`participants.test.tsx`). Two of the new `apps/api` tests needed a deliberate small
delay between two back-to-back in-process registrations to avoid a genuine
same-millisecond tie (the `date_trunc` fix resolves the cursor's own precision bug,
but two _different_ rows landing in the same millisecond still fall back to the
`id` tiebreaker, same accepted limitation `/mine` already has).

Live-verified via curl against a real Postgres + `apps/api`: a stranger (an
authenticated non-owner) gets `404 ride_not_found` from both new endpoints, an
unauthenticated caller gets `401`; the organizer's `/participants` view correctly
shows only the active registrant and `/waitlist` shows the queue in FIFO order,
including a participant with no `displayName` rendering as `null` (never an empty
string); after the registered participant cancels (auto-promoting the oldest
waiter), both views update correctly in the same request — participants now shows
the promoted user, waitlist drops to the one remaining entry. Also browser-verified
(`browser-automation` skill) at both desktop and 375px mobile widths: the populated
page renders both sections with real data and correct Russian date formatting, the
empty-ride case shows both empty states with the correct copy, and
`scrollWidth === clientWidth` at 375px (no horizontal scroll). All scratch data
(rides/organizer profile/users) deleted from the DB afterward, confirmed by a direct
count query.

Files: `packages/types/src/api/registrations.ts` (`RideParticipantSummary`,
`ListRideParticipantsResponse`, `ListRideWaitlistResponse`);
`apps/api/src/modules/registrations/{registrations.service,registrations.routes,
registrations.routes.test}.ts` (`assertOwnRide`, `listParticipants`, `listWaitlist`,
`INVALID_CURSOR`, two new `GET` routes); `apps/web/src/features/organizer/
participants/` (new: `api.ts`, `components/{ParticipantTable,WaitlistTable}.tsx`,
`participants.test.tsx`); `apps/web/src/app/organizer/rides/[id]/participants/
page.tsx` (new); `apps/web/src/features/organizer/rides/components/
EditRideForm.tsx` (new link); `packages/ui/src/terminology.ts`
(`PARTICIPANTS_TERMS`, `RIDE_EDIT_TERMS.participantsLink`); `docs/{api,tasks}.md`.

Decisions: none new at the ADR level — organizer-only visibility into
registrations/waitlist is `docs/product.md`'s existing "manage registrations and
waitlist" capability, and the response-minimization call follows
`.claude/rules/security.md` directly rather than inventing a new policy.

Known limitations: none new. Removing a participant, messaging a participant, and
exporting the list are all out of scope (no doc asks for them yet). `docs/tasks.md`'s
Registration section now has only CR-091 ("My registrations") remaining.

Follow-up: CR-091 (`/me/rides`) is the last open Registration-section ticket. Worth
remembering for any future ascending-order cursor endpoint sorted by a
microsecond-precision timestamp column: apply the same `date_trunc('milliseconds',
...)` treatment `listParticipants`/`listWaitlist` use, not just `/mine`'s descending
pattern.

## 2026-09-16 — CR-091 — Registration — my registrations (`/me/rides`)

Summary: closed the last open item in the Registration section (KI-037). New `GET
/v1/registrations/mine?when=upcoming|past` — the caller's own **active** registrations
only (a cancelled one isn't "a ride you're registered for" any more, same filter
CR-037's participant/waitlist lists use), each joined with its ride's public+organizer
summary (`{ registration, ride }`, reusing `Registration`/`PublicRide` as-is — no third
shape invented). Two independently cursor-paginated tabs (`when` required, no "all"
default), not one page split client-side — `upcoming` is `ride.startsAt >= now()`
ordered `startsAt asc` (soonest first), `past` is `< now()` ordered `startsAt desc`
(most recent past first); no `date_trunc('milliseconds', ...)` fix needed since
`startsAt` is organizer-entered, not `now()`-derived. Mounted at its own
`/v1/registrations` prefix (a new plugin, `myRegistrationsRoutes`, in the same
`registrations` capability module) rather than nested under `/rides` — no single-ride
parent, and `/v1/rides/mine` was already taken by the organizer's own-rides list
(CR-088). Waitlist entries are out of scope (still visible on the specific ride's
`/rides/[id]` page) — `docs/product.md` only names "view registered rides".
`apps/web` gained the participant cabinet's second nav entry, `/me/rides`
(`MyRidesView` — Upcoming/Past tabs, one page per tab, no "load more" yet, same
precedent every other list screen already set), and a feature-local `MyRideCard` (not
a reuse of discovery's own `RideCard` — `.claude/rules/extensibility.md` forbids a
feature module depending on another's internals; `docs/design.md` §9 already documents
`RideCard` as feature-local for the same reason). Read-only: cancellation stays on
each ride's own `/rides/[id]` page, not duplicated here.

Found and fixed one real bug while building this: interpolating a raw JS `Date` into a
hand-written `sql` template for the `startsAt >=/< now()` filter threw
`ERR_INVALID_ARG_TYPE` from the `postgres` driver — same root cause
`rides.service.ts`'s `listOwnRides` already documents for its own cursor comparison
(the driver only auto-serializes parameters bound through Drizzle's typed column
helpers, not a raw `Date` in a template). Fixed by passing the ISO string with an
explicit `::timestamptz` cast, same pattern used everywhere else in this file.

Live-verified via curl against a real Postgres + `apps/api`: an organizer publishes
and opens registration on an upcoming ride and a ride whose `startsAt` was set into
the past; a participant registers for both; `GET .../mine?when=upcoming` returns only
the upcoming one, `?when=past` returns only the past one, each with the correct ride/
organizer data; no session cookie → `401`; missing `when` → `400`. All scratch data
(rides/organizer profile/users) deleted from the DB afterward, confirmed by a direct
count query.

Files: `packages/types/src/api/registrations.ts` (`MyRegistrationSummary`,
`myRegistrationsQuerySchema`/`MyRegistrationsQuery`, `ListMyRegistrationsResponse`);
`apps/api/src/modules/rides/rides.service.ts` (`toPublicRide` now exported, reused by
the new service function — same cross-module reuse direction `toRegistration`/
`toWaitlistEntry` already established the other way); `apps/api/src/modules/
registrations/{registrations.service,registrations.routes,registrations.routes.test}.ts`
(`listMyRegistrations`, response schema, new `myRegistrationsRoutes` plugin, plus a
`createOrganizerRide` test-helper extension — `startsAt`/`organizerToken` overrides —
to build a past-dated ride and reuse one organizer across several rides within the
`/v1/auth/register` rate limit); `apps/api/src/routes/v1.ts` (registers the new plugin
under `/registrations`); `apps/web/src/features/participant/my-rides/` (new: `api.ts`,
`nav.ts`, `components/{MyRidesView,MyRideCard,MyRegistrationsTabs}.tsx`,
`my-rides.test.tsx`); `apps/web/src/lib/cabinet/participant-nav.ts` (registers the new
nav item); `apps/web/src/app/me/rides/page.tsx` (new); `packages/ui/src/terminology.ts`
(`CABINET_TERMS.myRegistrationsNavLabel`, `MY_REGISTRATIONS_TERMS`); `docs/{api,
tasks}.md`.

Decisions: none new at the ADR level.

Known limitations: none new. `docs/tasks.md`'s Registration section (CR-032..037,
CR-091) is now fully complete — Communication (CR-038..041) is next.

Follow-up: none specific to this ticket.

## 2026-09-16 — CR-038/039/040/041 — Communication (registration confirmation, ride updates, cancellation notification, in-app notifications)

Summary: closed `docs/tasks.md`'s Communication section in one bundle — three
notification producers feeding one consumer, same "bundle a table's producers and
consumer together" precedent CR-032..035 set for registration. ADR-007
(Notifications, Pending) says "start with in-app notifications; external provider
later behind an adapter" — this is that starting point, no email/push anywhere in
this ticket.

Two new tables: `ride_updates` (tenth domain table — `rideId`, `message`,
`createdAt`, `updatedBy`; no edit/delete, only create + list) and `notifications`
(eleventh — `userId`/`rideId`/`rideUpdateId` (nullable, only for `type =
'ride_update'`)/`type` (`registration_confirmed`/`ride_update`/`ride_cancelled`
pg enum)/`createdAt`/`readAt`). A CHECK constraint enforces `rideUpdateId`
non-null iff `type = 'ride_update'`.

New `apps/api` capability module, `modules/notifications/`
(`.claude/rules/architecture.md`'s feature-boundary list already named
`notifications`): `createRegistrationConfirmedNotification` (CR-038, called from
`registrations.service.ts`'s `createRegistration` and from `cancelRegistration`'s
waitlist-promotion branch — a waitlist promotion is "you are now registered" too,
reusing the same notification type rather than inventing a fourth one),
`createRideUpdate`/`listRideUpdates` (CR-039, organizer-only,
`POST`/`GET /v1/rides/:id/updates`, sharing the `/rides` prefix the same way
`registrationsRoutes` already does), `notifyRideCancelled` (CR-040, called from
`rides.service.ts`'s `cancelRide`), `listMyNotifications`/`markNotificationRead`
(CR-041, `GET /v1/notifications/mine` + `POST /v1/notifications/:id/read`, own
`/notifications` prefix — same "no single-ride parent" reasoning
`myRegistrationsRoutes` already used). Every fan-out is scoped to active
registrations only, not waitlist entries — same precedent CR-037/CR-091 already
established for "the participant list."

Delivery mechanism, a deliberate scope decision: a plain DB insert, in the same
request, immediately after (never inside) the triggering transaction — not a
Redis queue. `.claude/rules/resilience.md` names Redis for decoupling notification
delivery, but that's CR-050 ("Async notification delivery via Redis queue"), a
distinct, still-open backlog item, and Redis has never been live-verified in this
environment (KI-014). In-app notifications are a same-database insert, not a call
to an external provider, so the resilience property that actually matters today —
"never let this side effect fail or roll back the critical action" — is satisfied
by wrapping every notification insert in `try`/`catch` (logged via
`request.log.error`, never rethrown): a notification failure can never lose a
registration/cancellation/update. Recorded as an accepted interim posture, new
KI-040, pointing at CR-050 as the upgrade path.

`apps/web` gained `features/organizer/updates/` (`UpdateComposer` — compose form +
read-only history, `docs/design.md` §9's named component) and
`/organizer/rides/[id]/updates`, linked from `EditRideForm` via a new
"Обновления →" link (same row as "Маршрут →"/"Участники →"). Also gained
`features/participant/notifications/` (`NotificationList` — one page, newest
first, no unread-count badge or bulk "mark all read" in this ticket; clicking an
unread card marks it read, fire-and-forget, and links into the ride) and
`/me/notifications`, the participant cabinet's third nav entry.

Validation: `turbo run lint typecheck test` — 19/19 tasks green (`apps/api` 242
tests, +16 new; `apps/web` 147 tests, +11 new; `packages/ui` 85 tests
unchanged). `NODE_ENV=production turbo run build` — all 6 build tasks pass, both
new routes (`/me/notifications`, `/organizer/rides/[id]/updates`) present in
`web:build`'s route list. Live-verified via curl against a real Postgres +
running `apps/api`: registering created a `registration_confirmed` notification;
a waitlist auto-promotion notified the promoted user, not the cancelling one;
an organizer's update fanned out to the one active registrant with the correct
message/ride title; cancelling the ride fanned out `ride_cancelled` to the same
registrant; marking a notification read was idempotent (same `readAt` on a
second call); a stranger got `404 notification_not_found` trying to mark someone
else's notification read. All scratch data (rides/organizer profile/users)
deleted from the DB afterward, confirmed by a direct count query.

Files: `packages/db/src/schema/{ride-update,notification}.ts` + migration
`0011_silent_cyclops.sql`; `packages/types/src/domain/{ride-update,
notification}.ts`, `packages/types/src/api/notifications.ts`;
`apps/api/src/modules/notifications/` (new: `notifications.service.ts`,
`notifications.routes.ts`, `notification-response.schema.ts`,
`notifications.routes.test.ts`); `apps/api/src/modules/registrations/
registrations.service.ts` (notification calls added to `createRegistration`/
`cancelRegistration`, both gained a `logger` parameter);
`apps/api/src/modules/rides/rides.service.ts` (`cancelRide` gained a `logger`
parameter + the cancellation fan-out call); `apps/api/src/routes/v1.ts`
(registers the two new plugins); `apps/web/src/features/organizer/updates/` (new);
`apps/web/src/app/organizer/rides/[id]/updates/page.tsx` (new);
`apps/web/src/features/organizer/rides/components/EditRideForm.tsx` (new link);
`apps/web/src/features/participant/notifications/` (new);
`apps/web/src/app/me/notifications/page.tsx` (new);
`apps/web/src/lib/cabinet/participant-nav.ts` (registers the new nav item);
`packages/ui/src/terminology.ts` (`RIDE_UPDATES_TERMS`, `NOTIFICATIONS_TERMS`,
`RIDE_EDIT_TERMS.updatesLink`, `CABINET_TERMS.notificationsNavLabel`);
`docs/{api,tasks}.md`; `.claude/context/known-issues.md` (new KI-040).

Decisions: none new at the ADR level — ADR-007 stays Pending (in-app now,
external-provider adapter later, per its own text); the delivery-mechanism call
above is a scope decision recorded in `.claude/context/current-task.md` and
KI-040, not an ADR (it doesn't change the fixed stack or an accepted
architectural boundary).

Known limitations: KI-040 (notification delivery is a same-request insert, not a
queued job — see above). No unread-count badge anywhere in the UI (no design-doc
spec for one). `docs/tasks.md`'s Communication section (CR-038..041) is now fully
complete — Post-ride (CR-042 Review, CR-043 Organizer rating summary) is next.

Follow-up: CR-050 should replace the direct-insert step in
`apps/api/src/modules/notifications/notifications.service.ts`'s three producers
with a real Redis-backed enqueue, once that queue exists and Redis is
live-verified (KI-014) — the `NotificationLogger`-based `try`/`catch` shape is
the seam to swap, not a producer rewrite.

---

## 2026-09-16 — CR-042 / CR-043 — Post-ride (Review, Organizer rating summary)

Summary: closes `docs/tasks.md`'s Post-ride section, bundled in one task the same
way CR-032..035 and CR-038..041 were — a new `reviews` table/capability module
(CR-042) plus the aggregate it makes possible, an organizer's overall rating
(CR-043), surfaced with no new endpoint. `docs/api.md`/`docs/product.md` only
stubbed these two tickets (`POST`/`GET /v1/rides/:id/reviews`, "review completed
rides") — every eligibility/shape decision below is this task's own scope call,
made consistent with existing precedent and recorded in
`.claude/context/current-task.md`.

Twelfth domain table, `reviews` (migration `0012_brave_richard_fisk.sql`): `id`,
`rideId` (FK → `rides`, cascade), `userId` (FK → `users`, cascade — deliberately no
FK to `registrations`, so a later cancellation can never retroactively invalidate an
already-submitted review), `rating` (int, CHECK `1-5`), `comment` (nullable,
≤2000 chars, Zod-layer bound only), `createdAt`. No edit/delete — create + list
only, same immutable-message precedent as `ride_updates`. A plain (non-partial)
unique index on `(rideId, userId)` enforces one review per participant per ride
(reviews have no `status`/cancel dimension, unlike `registrations`/
`waitlist_entries`) and doubles as the index backing the review-list/rating-join
queries.

New `apps/api` capability module, `modules/reviews/` (`.claude/rules/
architecture.md` already named `reviews` as its own feature boundary — unlike
`ride_updates`, which shares the `notifications` module, this one gets its own).
`createReview` — eligibility is an _active_ registration on a `finished` ride
(`403 not_a_participant`/`409 ride_not_finished`; a cancelled registrant cannot
review), `409 review_already_exists` on a duplicate (checked, then re-caught as
the same code on the DB unique-index race, same pattern
`organizers.service.ts`'s `createOrganizerProfile` already uses).
`listRideReviews` — public (no session), paginated, newest first.
`getOrganizerRatingSummary`/`getOrganizerRatingSummaries` — `avg(rating)`/
`count(*)` across every review on any of an organizer's rides, computed via a
join (no denormalized column, `.claude/rules/database.md` doesn't ask for one at
this scale); the batched (`group by`) variant is used on the two paginated,
potentially-many-organizers-per-page endpoints (`GET /v1/rides` discovery,
`GET /v1/registrations/mine`) to avoid N+1, the single-organizer variant on
`GET /v1/rides/:id` and all three `/v1/organizers/me` endpoints.

No new endpoint for CR-043 — `rating`/`reviewCount` are additive fields on
`RideOrganizerSummary` (so they ride along on the existing `organizer: { id, name
}` embed everywhere it already appears) and on `GET`/`POST`/`PATCH
/v1/organizers/me`'s response, alongside `organizerProfile` — same "complete ride
record, not a link out" reasoning `docs/api.md` already gives for why no standalone
`GET /v1/organizers/:id` exists. `GetRideResponse` also gained `viewerReview` (the
caller's own review, `null` if none/unauthenticated), same "embed the caller's own
state" precedent as `viewerRegistration`/`viewerWaitlistEntry`.

`apps/web`: `features/participant/ride-detail/` gained `ReviewForm` (a feature-local
1-5 rating picker — no shared rating-input component exists yet, same "don't invent
a shared component for one call site" reasoning) and `ReviewList`
(`docs/design.md` §9's named components), both rendered from a new "Отзывы"
section on `/rides/[id]`, shown only once `ride.status === 'finished'`; the form
itself only when `viewerRegistration` is set and `viewerReview` is still `null` —
its absence is the "you can't/already did" signal, no separate copy. The ride
detail header and `/organizer/profile` (`OrganizerProfileForm`) both show the
organizer's aggregate rating via a new `formatRatingParts`/`formatRating`
formatter (`docs/design.md` §7: `4,8 ★`, missing/no-reviews renders `—`, correct
Russian plural for the review count via a small `n % 10`/`n % 100` helper in
`terminology.ts`).

Validation: `turbo run lint typecheck test build` — all 25 tasks green (`apps/api`
255 tests, +13 new in `reviews.routes.test.ts`, run against a real, migrated local
Postgres per this repo's existing test discipline — not mocked; `apps/web` 155
tests, +8 new — 5 in `ride-detail.test.tsx` covering the eligibility/already-
reviewed/organizer-rating-across-rides scenarios, 3 in `organizer-profile.test.tsx`
covering the rating card; `packages/ui` 90 tests, +5 new — `formatRating`/
`formatRatingParts` in `format.test.ts`, the Russian plural helper via
`ORGANIZER_TERMS.ratingReviewsCount` in `terminology.test.ts`. The
`reviews.routes.test.ts` migration itself was applied to and verified against the
real local Postgres (`coffee_ride_dev`, Homebrew-installed, independent of the
still-unavailable Docker daemon — KI-019) before any test ran. `NODE_ENV=production
turbo run build` — all 6 build tasks pass; `/rides/[id]`'s route stays dynamic
(`ƒ`), no new route needed since reviews live inside the existing ride-detail page.

Files: `packages/db/src/schema/review.ts` (new) + `schema/index.ts` + migration
`0012_brave_richard_fisk.sql`; `packages/types/src/domain/review.ts` (new),
`packages/types/src/api/reviews.ts` (new), `packages/types/src/api/rides.ts`
(`RideOrganizerSummary` gains `rating`/`reviewCount`, `GetRideResponse` gains
`viewerReview`), `packages/types/src/api/organizers.ts`
(`OrganizerProfileResponse` gains `rating`/`reviewCount`), `index.ts`;
`apps/api/src/modules/reviews/` (new: `reviews.service.ts`, `reviews.routes.ts`,
`review-response.schema.ts`, `reviews.routes.test.ts`);
`apps/api/src/modules/rides/rides.service.ts` (`getRideForViewer`/
`listPublicRides` gain the rating join, `getRideForViewer` gains `viewerReview`),
`apps/api/src/modules/rides/rides.routes.ts`/`ride-response.schema.ts` (schema
additions — the Fastify Zod serializer strips unlisted fields, so these had to
move in lockstep with the type changes); `apps/api/src/modules/registrations/
registrations.service.ts` (`listMyRegistrations` gains the batched rating join);
`apps/api/src/modules/organizers/organizers.service.ts`/`organizers.routes.ts`
(all three handlers now return `{ organizerProfile, rating, reviewCount }`);
`apps/api/src/routes/v1.ts` (registers `reviewsRoutes`); `apps/api/src/modules/
rides/rides.routes.test.ts` (2 pre-existing organizer-embed assertions updated
for the additive fields); `apps/web/src/features/participant/ride-detail/`
(`api.ts` gains `createReview`/`getRideReviews`, new `ReviewForm.tsx`/
`ReviewList.tsx`, `RideDetailView.tsx` wires the new section + organizer rating
line); `apps/web/src/features/organizer/profile/components/
OrganizerProfileForm.tsx` (rating card); `packages/ui/src/format.ts`
(`formatRatingParts`/`formatRating`), `packages/ui/src/terminology.ts`
(`REVIEWS_TERMS`, `ORGANIZER_TERMS`/`RIDE_DETAIL_TERMS` rating fields,
`formatReviewsCount` plural helper); test fixture updates across
`discovery.test.tsx`/`my-rides.test.tsx`/`ride-detail.test.tsx`/
`organizer-profile.test.tsx`/`organizer-profile-widget.test.tsx` for the new
additive fields; `docs/{api,database,design,tasks}.md`.

Decisions: none new at the ADR level — this stays inside the existing modular-
monolith/capability-module architecture (ADR-008) and the existing "no standalone
organizer endpoint" precedent (CR-023's own reasoning in `docs/api.md`), just a
new capability module of the kind `.claude/rules/architecture.md` already
enumerates.

Known limitations: no review edit/delete (matches `RideUpdate`'s own precedent,
not named in any doc as a need); no "my reviews" list for a participant (nothing in
`docs/design.md`'s screen inventory names one); the rating aggregate is computed
live via a join on every read rather than cached/denormalized — fine at MVP scale,
would need revisiting if organizer-profile or discovery-list read volume grows
materially. `docs/tasks.md`'s Post-ride section (CR-042/CR-043) is now fully
complete — Quality (CR-044..048) is next.

Follow-up: none identified beyond the "known limitations" above — no ticket
currently depends on a review edit/delete or a cached rating.

## 2026-09-16 — CR-044 / CR-045 / CR-046 / CR-047 / CR-048 — Quality (Responsive UI, Accessibility, Error/loading/empty states, Security review, Performance review)

Verification passes over the 16 screens already built to `docs/design.md`, per
`docs/tasks.md`'s own framing ("not the point where responsive/a11y/state work
starts... a screen that ships without them is not done"). Three parallel
Explore-agent audits (states / responsive+a11y / security+perf — methodology and
full findings in `.claude/context/current-task.md`) found a small number of real
gaps against each rules doc; everything else checked was already compliant. Scope
decision: fix every real gap found; for the two security findings that are the
exact scope of an already-tracked separate ticket (CR-058, CR-061), document only,
don't implement under this task.

CR-046 (states, `docs/design.md` §10): systemic gap — 12 of 14 `ErrorState` call
sites rendered `message` only, no `onRetry`, though §10 point 3 requires a retry
affordance and two sites (`ReviewList.tsx`, `RideDetailView.tsx`'s `RouteSection`)
already proved the pattern. Added `onRetry` (re-running the same fetch, via either
an `attempt` counter added to the effect's dependency array or an existing named
reload function) to the 11 remaining sites: `DiscoveryList`, `MyRidesView`,
`NotificationList`, `RideDetailView` (top-level ride load), `RidesList`,
`EditRideForm`, `ParticipantTable`, `WaitlistTable`, `RouteUploadForm`,
`OrganizerProfileForm`, `OrganizerProfileWidget`, `UpdateComposer`. Also
normalized `UpdateComposer`'s submit-error fallback from the raw
`ApiError.problem.detail` string to the shared `AUTH_TERMS.genericError` term
(`problem.detail` is contractually safe per `.claude/rules/backend.md`, so this
wasn't a leak — just the one form not following the same static-term convention
every other form in the repo uses).

CR-044 (responsive, `docs/design.md` §11): five gaps, each traced to one of §11's
five named breakpoints. `CabinetShell.tsx` (shared shell for all 12 `/me/*`+
`/organizer/*` pages) had a single unconditional nav row — now a fixed bottom tab
bar at `base`, an ordinary sticky side-nav column at `md`+, wrapped in a real
`<main>` (also closes CR-045's gap, see below). `RideDetailView.tsx` was a single
column at every width — now a two-column grid at `md`+ (primary content left,
route/stops right; the reviews section stays full-width below both, a long list
doesn't fit a fixed column). `DiscoveryList`/`DiscoveryViewToggle` only ever
showed one of list/map, toggled — `DiscoveryViewToggle` already carried a code
comment deferring this exact work to CR-044; now both panels stay mounted with the
inactive one CSS-gated `hidden lg:block`, so `lg`+ shows the combined split view
§11 asks for while `base`/`md` keep the toggle-driven single-panel behavior
unchanged; the toggle itself gets `lg:hidden` since it's moot once both panels are
visible. `packages/ui`'s `MetricRow` jumped straight from a `base` 2-column grid
to `md`'s flex-row wrap, skipping §11's own named `sm` two-column step — now
`base` is a single column, `sm` is 2-column grid, `md`+ is the existing flex-row.
No shared `xl` max-width-1200px-centered container existed anywhere — added once,
in root `layout.tsx`, wrapping `{children}`; the three growing layouts above
(`CabinetShell`, discovery `page.tsx`, ride-detail `page.tsx`) had their own
too-narrow per-page caps widened (`max-w-3xl`→`max-w-5xl`/`max-w-4xl`) so they can
actually use the room up to that shared cap instead of the outer container being a
no-op. Participant/waitlist lists and every form were already mobile-first/
card-based and were not touched.

CR-045 (accessibility, `docs/design.md` §12, WCAG 2.1 AA): one real gap — no
`<main>` landmark on any of the 12 cabinet pages (`CabinetShell.tsx` wrapped
content in a plain `<div>`), fixed once in the shell alongside the CR-044 nav
work. Everything else verified compliant, no code change needed: no raw hex
(ESLint rule active + clean), focus rings on every shared interactive primitive,
every form input has a real `<label>` + `aria-describedby` error linking
(`FormField.tsx`), no color-alone conveyance (`StatusBadge`/`DifficultyScale`
always pair with text), reduced-motion respected where it matters (`Skeleton`'s
`motion-safe:animate-pulse`, test-enforced), one real `<h1>` per page. Map
keyboard operability is not yet applicable — no live 2GIS integration exists
(KI-016/KI-031, still a degraded placeholder with no interactive surface) —
recorded as "re-verify once a live map ships," not a fixable gap today.

CR-047 (security, `.claude/rules/security.md`): walked the full checklist against
the whole app, not just auth endpoints. Verified compliant: Argon2id hashing, no
plaintext anywhere, account-enumeration-safe login errors, session cookie flags
(httpOnly/Secure-in-prod/SameSite=Lax), CSRF plugin wired (not just written),
consistent server-side ownership checks across rides/registrations/reviews/
organizers (identity always from session, never client-supplied), Zod on every
route, parameterized Drizzle queries only, participant responses minimized (no
phone/email in participant-list schemas), `.env` gitignored/no hardcoded secrets,
audit columns (`updatedBy`/timestamps) present on sensitive tables. No new gaps
found beyond two KI-022 already tracked at a narrower (auth-only) scope — widened
that entry instead of opening duplicates: (1) HIGH — no `@fastify/helmet` (or
equivalent) registered, zero security headers on any response API-wide, exact
scope of CR-061 (currently open); (2) MEDIUM/LOW — auth and general rate limiting
are still in-memory, per-IP-only, single-instance (`@fastify/rate-limit`'s default
store), exact scope of CR-058 (blocked on KI-014, Redis never live-verified in
this environment). Both documented in `.claude/context/known-issues.md`
(KI-022's update), neither implemented here, per the scope decision.

CR-048 (performance): verified compliant — organizer rating aggregate is a
genuine batched `GROUP BY` query (not N+1, confirmed again against CR-042/043's
own work), explicit indexes exist on the FK/filter columns that matter, every
list endpoint uses the shared cursor-pagination helper (ADR-011). One LOW fix
applied: `RideCard.tsx`/`RideDetailView.tsx` rendered `ride.coverImageUrl` via a
raw `<img>` (eslint-disabled) — swapped to `next/image` (`fill` + a `relative`
wrapper, matching the prior fixed-size `object-cover` styling). Currently inert
(`coverImageUrl` is always `null` — no S3 pipeline yet, KI-023/CR-086) but cheap
to fix now so the branch is already optimized the moment CR-086 wires a real
value through; `next/image` will additionally need the eventual S3 domain in
`next.config.ts`'s `images.remotePatterns`, which is CR-086's job alongside the
pipeline itself, not this one.

Validation: `pnpm --filter ui --filter web run typecheck` and `... run lint` both
clean. `pnpm --filter ui --filter web run test` — `packages/ui` 90/90 passed
(unchanged — `MetricRow.test.tsx` updated to assert the new `sm:grid-cols-2`
class rather than added-to), `apps/web` 157/157 passed (+2 new: the split-view
class-assertion tests in `discovery.test.tsx` replacing the old DOM-presence
assertion, which the CR-044 fix made incorrect — both panels now stay mounted,
CSS-gated, rather than one being absent from the DOM entirely). `NODE_ENV=production
pnpm --filter ui --filter web --filter types run build` — all green, 14 static +
dynamic routes generated. `apps/api`/`packages/db` untouched by this task, not
re-run.

Files: `apps/web/src/components/cabinet/CabinetShell.tsx` (responsive nav +
`<main>`), `apps/web/src/features/participant/ride-detail/components/
RideDetailView.tsx` (two-column grid, top-level `onRetry`, `next/image`),
`apps/web/src/features/participant/discovery/components/{DiscoveryList,
DiscoveryViewToggle,RideCard}.tsx` (split view, `onRetry`, `next/image`),
`packages/ui/src/components/MetricRow.tsx` (+ `.test.tsx`), `apps/web/src/app/
layout.tsx` (shared `xl` container), `apps/web/src/app/page.tsx`/`rides/[id]/
page.tsx` (widened per-page max-width), 11 `ErrorState` call sites listed under
CR-046 above, `apps/web/src/features/organizer/updates/components/
UpdateComposer.tsx` (retry + `AUTH_TERMS.genericError` normalization),
`apps/web/src/features/participant/discovery/discovery.test.tsx` (split-view
assertions), `.claude/context/known-issues.md` (KI-022 widened),
`docs/tasks.md`, `.claude/context/project-state.md`.

Decisions: none new at the ADR level — every fix stays inside existing patterns
(`ErrorState`'s existing `onRetry` prop, `docs/design.md`'s already-specified
breakpoints/landmarks, `next/image`, the existing `AUTH_TERMS.genericError`
convention).

Known limitations: CR-058 (rate limiting) and CR-061 (security headers) remain
open, tracked in KI-022 — not this task's scope. `next/image`'s `RideCard`/
`RideDetailView` swap has no `images.remotePatterns` configured yet since no real
image domain exists (CR-086); harmless today (`coverImageUrl` is always `null`)
but CR-086 must add that config as part of wiring the real pipeline, not assume
the tag swap alone is sufficient.

Follow-up: CR-058, CR-060, CR-061 are the next security-hardening tickets
(`docs/tasks.md`'s Resilience/Auth-follow-up sections); none of them were blocked
or newly required by this task, just re-confirmed still open and in scope.

## 2026-09-16 — CR-049 — Timeout/retry/circuit-breaker utilities for external integrations

Summary: Both existing external-call sites (`packages/maps-2gis`'s `fetchJson`,
`apps/api`'s S3 `route-storage.ts`) had a timeout and, in `route-storage.ts`'s case, an
ad hoc retry — but no circuit breaker, and each had its own independent
implementation, exactly the duplication both call sites' own comments flagged as
CR-049's job to resolve (see ADR-015's "What this does NOT mean"). Built one shared
package, `packages/resilience`, and wired both call sites to it: `callWithResilience`
(timeout via `AbortSignal`, bounded retry with jittered exponential backoff) plus
`CircuitBreaker` (closed → open after N consecutive failures → half-open single trial
→ closed on trial success). Each integration shares one breaker instance across every
call it makes (not per call) and normalizes `ResilienceError` into its own existing
domain error at the boundary (`MapProviderError`, `RouteStorageError`) — no caller of
either module saw its error-handling contract change.
Files: `packages/resilience/` (new package — `src/circuit-breaker.ts`,
`src/call-with-resilience.ts`, `src/errors.ts`, `src/index.ts`, plus 15 unit tests
across two `*.test.ts` files); `packages/maps-2gis/src/{http.ts,geocode.ts,route.ts,
provider.ts,errors.ts}` (retry + shared breaker, one breaker per `MapProvider`
instance); `apps/api/src/modules/rides/route-storage.ts` (module-level breaker
replacing the local `withResilience`); `packages/maps-2gis/package.json`,
`apps/api/package.json` (new `resilience` workspace dependency).
Decisions: ADR-016 (`docs/decisions.md`) — new shared package, new allowed dependency
edges `apps/api → resilience` and `packages/maps-2gis → resilience`
(`.claude/rules/architecture.md` updated); `.claude/rules/resilience.md` now points at
the concrete implementation instead of only describing the required pattern.
Follow-up: CR-050 (async notification delivery via Redis queue), CR-051 (health check
endpoint reporting DB/Redis/S3 status — a natural future consumer of
`CircuitBreaker.getState()`, not added speculatively here since nothing calls it yet),
CR-052 (frontend degraded-state handling) are the remaining Resilience-section
tickets, still open.

## 2026-09-16 — CR-050 — Async notification delivery via Redis queue

Summary: `.claude/rules/resilience.md` requires notification delivery to run outside
the request/response cycle via a Redis queue; KI-040 tracked the interim posture
(CR-038..041 inserted directly into `notifications` in the same request). This ticket
builds the real queue: a new `apps/api/src/modules/notifications/queue.ts`
(`registerNotificationQueue`) wires a `bullmq` `Queue` (producer) + in-process `Worker`
(consumer) on one `notifications` queue — the worker runs inside the same Fastify
process, not a second deployable service (ADR-008; `redis.ts`'s own CR-005 doc comment
already anticipated BullMQ as the eventual consumer). Decorates
`app.notificationQueue: NotificationQueue | null` — `null` when `REDIS_URL` isn't
configured, same "not configured is a degraded mode, never a boot-time crash" pattern
`plugins/s3.ts` already established for `app.s3` (KI-015).
`notifications.service.ts`'s three producers (`createRegistrationConfirmedNotification`,
`notifyRideCancelled`, the fan-out inside `createRideUpdate`) now take a `queue`
parameter: if configured, they enqueue and return immediately (the worker's job
processor, `processNotificationJob`, does the actual insert, dispatching on job name to
one of two raw insert functions shared with the no-queue fallback path); if not, they
fall back to the exact same direct synchronous insert CR-038..041 shipped. Every
existing route-level integration test exercises the fallback path unmodified (none of
them ever configure `REDIS_URL`), so this ships with zero changes to any pre-existing
test.
A real bug found and fixed during this session's own live verification (not just
reasoned about): naively awaiting BullMQ's `queue.add()` — and separately,
`worker.close()`/`queue.close()` — hangs indefinitely against a genuinely unreachable
Redis. `callWithResilience`'s `timeoutMs` does not help here, since it only bounds an
operation that itself honors the `AbortSignal` it's handed (like `fetch`/the AWS SDK's
`abortSignal` — see `route-storage.ts`), and BullMQ's API accepts no such signal.
`redis.ts`'s bounded `maxRetriesPerRequest` doesn't help either — it bounds a command
already queued on an established connection, not BullMQ's internal
`waitUntilReady()` wait for a `ready` event that ioredis's (deliberately infinite, so a
real outage self-heals without a restart) default reconnect strategy never stops
trying to produce. Fixed with a hand-rolled `raceTimeout` (a real `Promise.race`
against a plain timer, `queue.ts`) around both the enqueue call (1.5s bound) and each
graceful-close call (3s bound each) — confirmed live: before the fix, a script issuing
one `add()` call against an unreachable Redis never returned within 120s; after, it
fails in ~1.5s. A `CircuitBreaker` (`packages/resilience`, used directly rather than
through `callWithResilience` for the same reason) short-circuits the enqueue path
after 5 consecutive failures (30s cooldown, same values `route-storage.ts` uses) so a
sustained outage doesn't tax every request with that same timeout — also confirmed
live (6th call in the failure sequence failed in 0ms, "circuit open").
Files: `apps/api/src/modules/notifications/queue.ts` (new),
`apps/api/src/modules/notifications/queue.test.ts` (new, 6 tests — mocked `bullmq`/
`ioredis`, no live Redis needed, same "mock the SDK" technique `route.routes.test.ts`
uses for `@aws-sdk/client-s3`; covers the not-configured/configured/worker-dispatch/
circuit-breaker/bounded-shutdown paths), `apps/api/src/modules/notifications/
notifications.service.ts` (raw insert functions split out from each producer, new
`processNotificationJob` dispatcher, `NotificationQueue`/job-data types, `queue`
parameter threaded through the three producers), `apps/api/src/modules/
registrations/registrations.service.ts` (`createRegistration`/`cancelRegistration`),
`apps/api/src/modules/rides/rides.service.ts` (`cancelRide`), three routes files
(`registrations.routes.ts`, `rides.routes.ts`, `notifications.routes.ts` — pass
`app.notificationQueue` through), `apps/api/src/app.ts` (`registerNotificationQueue`
after `registerDb`), `apps/api/package.json` (new `bullmq` dependency).
Decisions: none new at the ADR level — stays inside ADR-008 (no second deployable
service) and reuses `packages/resilience`'s `CircuitBreaker` (ADR-016) directly rather
than through `callWithResilience`, for the documented reason above.
Validation: `pnpm --filter api run typecheck/lint/build` clean.
`pnpm --filter api run test` (real local Postgres) — 261/261 passed across 14 files
(255 pre-existing + 6 new `queue.test.ts`), all pre-existing tests unmodified. Live
manual verification against this environment's genuinely unreachable Redis
(KI-014): server boots cleanly with `REDIS_URL` configured and Redis unreachable (logs
connection errors, never crashes); a standalone script exercising `registerNotificationQueue`
directly confirmed the enqueue-timeout, circuit-breaker-open, and bounded-shutdown
behavior described above end to end, then deleted (not committed).
Known limitations: KI-014 (Redis never live-verified against a real, reachable
instance in this environment) stays open — this ticket makes the not-reachable case
behave correctly (bounded, non-hanging, logged), which is different from confirming a
job is actually consumed and inserted end to end against a live Redis; that
verification is still owed to the first session with a working Docker daemon or a
real Redis. KI-040 is resolved by this ticket (see below).
Follow-up: CR-051 (health check endpoint — a natural future consumer of the same
`CircuitBreaker`/connection-reachability signal this ticket introduces) and CR-052
(frontend degraded-state handling) are the remaining Resilience-section tickets.

## 2026-09-16 — CR-051 — Health check endpoint reporting DB/Redis/S3 status

Summary: `GET /health` (unversioned, ADR-011) was a bootstrap-only stub (`{ status:
'ok' }`) whose own comment already named this ticket as the one that replaces the
handler body — `.claude/rules/resilience.md` requires it to "report the status of its
own dependencies (DB, Redis, S3) without dying if one is degraded," and
`docs/api.md`'s `## Health` section documents the exact contract. Now runs a real,
bounded check per dependency and always returns `200` — this endpoint's whole purpose
is to observe a degraded dependency, not to also fail as one.
Response shape: `{ status: 'ok' | 'degraded', dependencies: { db, redis, s3 } }`,
each dependency one of `'ok' | 'error' | 'not_configured'`. `not_configured` is
deliberately distinct from `error`: Redis/S3 are optional infra (`REDIS_URL`/`S3_*`
unset — this environment, KI-014/KI-015) and their absence is an expected degraded
mode, not a failure to alert on; only an actual `error` on any dependency flips the
overall `status` to `'degraded'`. `db` has no `not_configured` state —
`DATABASE_URL` is required, so its absence is a boot-time env-validation error the
route never observes.
Neither postgres.js (`db.execute`) nor ioredis (`.ping()`) honor an `AbortSignal`,
so neither is actually bounded by `packages/resilience`'s `callWithResilience` — the
same gotcha CR-050 already hit and fixed for BullMQ's `Queue.add()`. Extracted that
fix (`raceTimeout`, a real `Promise.race` against a plain timer) out of
`queue.ts` into `apps/api/src/lib/race-timeout.ts` so this ticket doesn't hand-roll a
second copy; `queue.ts` now imports it too, with no behavior change (same tests still
pass unmodified). S3's `HeadBucketCommand` goes through the AWS SDK, which _does_
honor `abortSignal`, so its check uses `callWithResilience` directly (timeout only —
no retry/breaker: a diagnostic ping must not share `route-storage.ts`'s upload/
download/delete breaker, in either direction).
`app.redis: RedisClient | null` is a new decoration on `modules/notifications/
queue.ts`'s existing producer Redis connection (reused, not a fourth connection
opened just to ping) — `null` in the same "not configured is degraded, never a
boot-time crash" shape as `app.s3`.
Files: `apps/api/src/routes/health.ts` (real checks replacing the stub),
`apps/api/src/routes/health.test.ts` (new, 5 tests — mocks `@aws-sdk/client-s3`'s
`send`/`ioredis`'s `Redis`/`bullmq`'s `Queue`/`Worker`, same "mock the SDK" technique
as `route.routes.test.ts`/`queue.test.ts`; covers not-configured, all-healthy,
redis-error, s3-error, and a genuinely unreachable DB), `apps/api/src/lib/
race-timeout.ts` (new, extracted from `queue.ts`), `apps/api/src/modules/
notifications/queue.ts` (imports the extracted helper, decorates `app.redis`),
`apps/api/src/app.test.ts` (removed the now-superseded bootstrap-stub `/health`
test; its own comment updated to note `/health` has its own suite now).
Decisions: none new.
Validation: `pnpm --filter api run typecheck/lint/build` clean. `pnpm --filter api
run test` (real local Postgres) — 265/265 passed across 15 files (260 pre-existing,
minus the 1 removed stub test, plus 5 new `health.test.ts`). `pnpm turbo run
typecheck lint --filter=api --filter=resilience --filter=db` clean. Live manual
verification: booted `apps/api` with this environment's real local Postgres
reachable and Redis/S3 genuinely unreachable (KI-014/KI-015/KI-019, Docker down) —
`curl /health` returned `200` with `{"status":"degraded","dependencies":{"db":"ok",
"redis":"error","s3":"error"}}`, confirming the endpoint distinguishes a live
dependency from real failures and never fails hard, exactly as documented.
Known limitations: none new — KI-014/KI-015 stay open at their existing scope (a
live, _reachable_ Redis/S3 round trip is still unverified in this environment); this
ticket only adds the diagnostic surface that would report it once one exists.
Follow-up: CR-052 (frontend degraded-state handling) is the one remaining
Resilience-section ticket — a natural consumer of this endpoint's `dependencies`
detail, not just its overall `status`.

## 2026-09-17 — CR-052 — Frontend degraded-state handling (maps/uploads unavailable)

Summary: `.claude/rules/resilience.md` requires the frontend to handle a degraded
API response with a clear partial-failure UI state, never a blank screen or crash.
`docs/design.md` §10 names exactly two required cases: 2GIS unavailable (map area
shows an inline notice, rest of the screen stays usable) and S3 unavailable
(upload control shows "Загрузка недоступна", rest of the form still submits). A
read-only audit before writing any code found both cases already real, built
opportunistically during CR-026/027/028 rather than as this ticket: discovery's
`/` map (`RideMapPlaceholder`) and `/rides/[id]`'s route map
(`RouteMapPlaceholder`) both render a tested inline `ErrorState` (KI-031);
`RouteUploadForm`'s `handleUploadError` already maps the API's
`route_storage_unavailable` code to an inline degraded notice without blocking
the rest of the form. No other map or S3-upload surface exists (KI-023's
avatar/cover-image upload is still unbuilt, nothing to degrade there).
The one genuine gap: the degraded-upload path was only tested on the initial
`uploadRoute` (POST) call, not `replaceRoute` (PATCH) — added the missing
symmetric test (`route.test.tsx`, "shows the degraded storage-unavailable notice
on replace, not a hard error"). `deleteRoute` was checked and confirmed it can't
structurally hit this code path (`rides.service.ts`'s delete does the DB row
first and treats S3 cleanup as best-effort try/catch), so it's correctly
untested rather than a gap.
Decision: CR-050's changelog entry had speculated CR-052 would be "a natural
consumer of [`/health`]'s `dependencies` detail" — i.e. a proactive banner
driven by polling `GET /health`. `docs/design.md` §10, the actual spec for this
ticket, names only the two reactive per-call cases above and says nothing about
a global banner or `/health` polling; `apps/web` doesn't call `/health` anywhere
today. Closing CR-052 on the reactive, per-call handling that already exists and
is now fully tested, per `.claude/CLAUDE.md`'s "don't add features beyond what
the task requires" — a proactive global-degraded-banner is real product/UX
surface with no design-doc backing yet, not an implicit extension of this
ticket. Recorded explicitly (`.claude/context/known-issues.md`) so a future
session doesn't read the CR-050 note as still-open scope.
Files: `apps/web/src/features/organizer/route/route.test.tsx` (new test only;
no application code changed — the behavior it tests already existed).
Decisions: none new at the ADR level; the reactive-vs-proactive scoping decision
above is recorded here and in known-issues, not promoted to a full ADR (no
architecture change, just a scope boundary).
Validation: `pnpm --filter web run test` — 158/158 passed (157 pre-existing + 1
new), no other test modified. `pnpm --filter web run typecheck`/`lint` clean.
Known limitations: none new. A future proactive `/health`-driven degraded banner
remains a real option if a product need for one is identified, but needs its own
`docs/design.md` update first, not a retrofit into this ticket's closure.
This closes the Resilience section of `docs/tasks.md` (CR-049, CR-050, CR-051,
CR-052 all done).

## 2026-09-17 — CR-053 — Verified `packages/maps-core`/`packages/maps-2gis` split (ADR-010)

Summary: first ticket in the Extensibility foundations section. ADR-010
requires all map/geocoding/routing access to go through a provider-neutral
interface (`packages/maps-core`), with 2GIS as one concrete implementation
(`packages/maps-2gis`), and no other package importing the 2GIS SDK directly.
Before writing any code, checked whether this was already true — the split
was actually built during CR-007 (2026-09-12), before ADR-010 and this ticket
existed as separate numbered backlog items, the same "earlier work already
satisfies a later-numbered ticket" shape as CR-052.
Verified directly rather than assumed: `packages/maps-core/src/{types.ts,
provider.ts,index.ts}` match `.claude/rules/maps.md`'s interface contract
exactly (`LatLng`, `GeocodeResult`, `RouteRequest`, `RouteResult`,
`MapProvider`) with zero vendor imports and zero runtime dependencies;
`packages/maps-2gis` is the only package with 2GIS-specific logic; dependency
direction is correct (`maps-2gis`'s `package.json` depends on `maps-core`,
never the reverse); a repo-wide grep for `2gis|2GIS|dgis|MapGL` outside
`packages/maps-2gis` turned up only terminology/copy strings
(`packages/ui/terminology.ts`, the degraded-map-notice components) and env var
names (`apps/api/src/env.ts`) — never an actual SDK import.
Also confirmed `packages/maps-2gis` still has zero real consumers in
`apps/web`/`apps/api` — expected and already tracked, not this ticket's gap:
KI-016 blocks wiring a live geocode/routing call on a missing
`MAPS_2GIS_API_KEY` credential, KI-031 explains why map rendering stays a
placeholder (no MapGL key either). Building a composition point now, with
nothing real to wire it to, would be dead code behind an unverifiable
adapter — deferred to whichever ticket first has a live credential.
Files: none — no application code changed, only `docs/tasks.md`/
`docs/changelog.md`/`.claude/context/project-state.md`.
Decisions: none new — reaffirms ADR-010, doesn't change it.
Validation: `pnpm turbo run typecheck lint --filter=maps-core
--filter=maps-2gis` clean (all cache hits, no regression — nothing changed).
Known limitations: none new — KI-016/KI-031 stay open at their existing scope.
Follow-up: CR-054 (feature registry for dashboard nav/widgets) is next in the
Extensibility foundations section.

## 2026-09-17 — CR-054 — Verified feature registry for dashboard nav/widgets (ADR-009)

Summary: `.claude/rules/extensibility.md` requires shared surfaces that must
show every feature (dashboard nav, a widget grid) to be built as a registry a
feature registers a descriptor into, never a hard-coded branch. Audited
whether this already held before writing code — same "earlier ticket already
satisfies this one" shape as CR-052/CR-053.
Nav: already real and generic for both cabinets. `CabinetShell.tsx:98-106`
renders `navItems.map(...)`, no per-feature branch; `lib/cabinet/
organizer-nav.ts` (2 entries) and `participant-nav.ts` (3 entries) each just
list descriptors + `.sort` by `order`. Confirmed against `docs/design.md` §8
that organizer's 2 entries / participant's 3 are correct, not missing
coverage — screens like `/organizer/rides/[id]/edit|route|participants|
updates` are reached by drilling into a ride from the `/organizer/rides` list
(one nav entry covers the whole area), same shape as `/me/rides`'s
upcoming/past tabs. ADR-009 requires registration instead of branching, not
that every screen becomes its own nav item.
Widgets: already real and generic for the one cabinet `docs/design.md` §8
actually specs a widget grid for — only `/organizer` is listed as "Dashboard
(widgets from the ADR-009 registry)"; `/me` is plain "Participant cabinet
home" with no widget-grid requirement. Deliberately did not invent an empty
`PARTICIPANT_WIDGETS` registry with no real content behind it — that would be
exactly the "design for hypothetical future requirements" `.claude/CLAUDE.md`
warns against.
Real gaps closed: (1) zero test coverage of the registry mechanism itself —
no test exercised `CabinetShell`'s render-from-list loop, either nav
registry's sort-by-order, or `organizer-widgets.ts`'s sort/empty-fallback
branch in `app/organizer/page.tsx`. `apps/web/vitest.config.mts`'s own
`@`-alias comment had already anticipated a `CabinetShell` test but it was
never written. (2) Two inline comments (`lib/cabinet/types.ts`,
`lib/cabinet/organizer-widgets.ts`) claimed "flag-aware generalization... is
CR-054" — but `docs/tasks.md` lists that exact scope ("Feature flag utility
for staged cabinet feature rollout") as CR-055, its own ticket. Fixed both
comments to point at CR-055 instead of adding an unused `requiredCapability`/
flag field now with no current consumer — nothing in `docs/design.md` calls
for cabinet-nav icons or per-item capability gating today (both cabinets are
already separate route trees, not one merged nav needing per-item
visibility filtering).
Files: `apps/web/src/components/cabinet/CabinetShell.test.tsx` (new, 3
tests — generic render-from-arbitrary-list proof, 401→`/login` redirect,
non-401 generic error state), `apps/web/src/lib/cabinet/
cabinet-registries.test.ts` (new, 3 tests — sort-by-order for all three
registries), `apps/web/src/app/organizer/page.test.tsx` (new, 2 tests —
non-empty render loop + the previously-untested empty-registry fallback),
`apps/web/src/lib/cabinet/types.ts` + `organizer-widgets.ts` (comment fixes
only, no behavior change).
Decisions: none new at the ADR level — reaffirms ADR-009, doesn't change it.
Validation: `pnpm --filter web run test` — 166/166 passed (158 pre-existing +
8 new), no other test modified. `pnpm --filter web run typecheck`/`lint`
clean.
Known limitations: none new.
Follow-up: CR-055 (feature-flag utility for staged cabinet feature rollout)
is next in the Extensibility foundations section — it owns the flag/
capability-gating behavior these registries deliberately don't implement yet.

## 2026-09-17 — CR-055 — Feature flag utility for staged cabinet feature rollout

Summary: ADR-009/`.claude/rules/extensibility.md` require a new, risky, or
incrementally-shipped cabinet feature to gate behind a feature flag (a
config value, not a new deployment) "so partial rollout doesn't require a
rushed hotfix." Unlike CR-052/053/054, this was a genuine gap — grepped the
whole repo beforehand and found no flag mechanism anywhere, only a comment
(fixed by CR-054) pointing at this ticket.
Design: `isFeatureEnabled(flag)`/`filterEnabled(items)`
(`apps/web/src/lib/cabinet/feature-flags.ts`) are deliberately server-only.
`CabinetNavItem`/`DashboardWidget` registries are only ever imported by
Server Components today (`app/organizer/layout.tsx`, `app/me/layout.tsx`,
`app/organizer/page.tsx`) — filtering happens there, before the
already-filtered list crosses to a Client Component (`CabinetShell`, a
widget's own `Component`). This sidesteps a real Next.js constraint: a
`NEXT_PUBLIC_*` env var is only statically inlined for a literal
`process.env.X` member expression, never a dynamically computed key, so a
generic `isFeatureEnabled(name: string)` could not work if evaluated
client-side. Server-only env vars have no such restriction (plain Node.js
`process.env[key]` access at request time), so the utility takes an
arbitrary flag name and reads `FEATURE_<NAME>` — no `NEXT_PUBLIC_` prefix, no
browser exposure (the real cost `.env.example` already flags for
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`).
`app/organizer/page.tsx` had an unnecessary `'use client'` (no hooks/
interactivity of its own) blocking this — dropped it. Server Components can
render Client Components as children, so `OrganizerProfileWidget` (still
`'use client'`, unchanged) keeps working exactly as before.
No existing registry entry sets `flag` — every shipped cabinet feature is
stable, nothing is currently mid-rollout — so this ships as pure
infrastructure with zero behavior change today, matching the ticket's own
framing ("utility for staged rollout," not "gate feature X").
Files: `apps/web/src/lib/cabinet/feature-flags.ts` (new),
`apps/web/src/lib/cabinet/feature-flags.test.ts` (new, 8 tests — env
unset/falsy/truthy, case-insensitivity, item-with/without-flag, order
preservation across mixed items), `apps/web/src/lib/cabinet/types.ts`
(`flag?: string` added to both descriptor types), `apps/web/src/app/
organizer/layout.tsx` + `apps/web/src/app/me/layout.tsx` (filter their nav
registry before passing it to `CabinetShell`), `apps/web/src/app/organizer/
page.tsx` (dropped `'use client'`, filters `ORGANIZER_WIDGETS`),
`.claude/rules/extensibility.md` (records the `FEATURE_<NAME>` convention
and the Server-Component-only constraint).
Decisions: none new at the ADR level — implements ADR-009, doesn't change it.
Validation: `pnpm --filter web run test` — 174/174 passed (166 pre-existing +
8 new), no other test modified. `pnpm --filter web run typecheck`/`lint`/
`build` all clean — `build` mattered here specifically, given the Server/
Client boundary change on `/organizer`'s page. Live-verified against this
environment's real local Postgres (not just unit tests, given the boundary
change): booted `apps/api`+`apps/web`, registered and logged in a real test
user, curled `/organizer` and `/me` with the session cookie — both render
without error; the RSC payload confirms `CabinetShell` receives exactly the
expected filtered nav lists (`/organizer`: profile + rides; `/me`: my
registrations + profile + notifications, unchanged since nothing is
flagged) and `/organizer`'s widget grid still renders `OrganizerProfileWidget`
as a Client Component reference from the now-Server-Component page. Dev
servers stopped and temp files removed afterward.
Known limitations: none new.
Follow-up: CR-056 (lint rule/doc preventing direct 2GIS SDK imports outside
`packages/maps-2gis`) is the last ticket in the Extensibility foundations
section.

## 2026-09-17 — CR-056 — Lint rule preventing direct 2GIS SDK imports outside `packages/maps-2gis`

Summary: ADR-010/`.claude/rules/maps.md` require `packages/maps-2gis` to be
the only package allowed to import the 2GIS SDK; CR-053 verified this held
by convention (no actual SDK package is installed anywhere — `maps-2gis`
calls 2GIS's REST APIs via plain `fetch`). This ticket makes that convention
machine-enforced, the same "shared infra ahead of a specific need" shape as
`packages/resilience` (CR-049) — it guards the day a real vendor package
(e.g. for browser MapGL rendering, KI-031) gets installed somewhere it
shouldn't, rather than fixing an existing violation.
Rule: `no-restricted-imports` with `patterns: [{ group: ['*2gis*'], message:
... }]` — a glob matching any import specifier containing "2gis" anywhere
(catches `@2gis/mapgl` and any similarly-named future package), on every
workspace member except `packages/maps-2gis`.
Flat ESLint config has no directory cascading in this repo (CR-010/KI-012),
so every workspace member needed its own copy of the rule. Four packages
(`maps-core`, `resilience`, `types`, and `maps-2gis` itself) share
`packages/config`'s `nodeLibraryConfig()` factory — the rule was added there
once, on by default, with a `{ allowMapsSdkImports: true }` opt-out that
only `maps-2gis`'s own `eslint.config.mjs` passes. The five configs that
don't use that factory (`apps/web`, `apps/api`, `packages/db`,
`packages/ui`, `packages/config` itself) each got the same rule block added
directly — the same duplication shape the pre-existing "no raw hex color"
rule already established across `apps/web`/`packages/ui`.
Proven to actually fire, not just assumed: temporarily added `import {
something } from '@2gis/mapgl'` to a scratch file under `apps/web/src/lib/`,
confirmed `eslint` failed with this rule's exact message, then did the same
under `packages/maps-2gis/src/` and confirmed it passed (only the
pre-existing `no-console` warning) — proving the opt-out works too. Both
scratch files deleted afterward, never committed.
Files: `packages/config/eslint/node-library.js` (rule + opt-out option),
`packages/maps-2gis/eslint.config.mjs` (opts out), `apps/web/
eslint.config.mjs`, `apps/api/eslint.config.mjs`, `packages/db/
eslint.config.mjs`, `packages/ui/eslint.config.mjs`, `packages/config/
eslint.config.mjs` (rule added directly), `.claude/rules/maps.md` (records
the enforcement).
Decisions: none new at the ADR level — enforces ADR-010, doesn't change it.
Validation: `pnpm turbo run lint typecheck` — clean across all 9 workspace
members (0 real violations, since no 2GIS SDK import exists anywhere).
Manual proof of the rule firing/opting-out as described above.
Known limitations: none new.
Follow-up: this completes the Extensibility foundations section of
`docs/tasks.md` (CR-053, CR-054, CR-055, CR-056 all done). Security
foundations (CR-058 auth rate limiting, CR-060 password reset, CR-061
security headers) is the next open section.

## 2026-09-17 — CR-060 — Password reset flow

Summary: `.claude/rules/security.md` requires single-use, time-limited
password reset tokens with no account enumeration on the request endpoint;
`docs/api.md` already named `POST /v1/auth/forgot-password`/`reset-password`
with no body. This ticket implements both, mirroring CR-011's
email-verification-token shape.
Schema: new `password_reset_tokens` table (`packages/db`, migration
`0013_useful_living_tribunal.sql`) — `id`, `userId` (FK → `users`, cascade),
`tokenHash` (unique, SHA-256 of the raw token), `expiresAt` (30 min —
top of security.md's 15–30 min range), `usedAt` (nullable, single-use),
`createdAt`. Applied and verified against this environment's real local
Postgres.
API: `POST /v1/auth/forgot-password` — body `{ email }`, always `204` with no
body regardless of whether the account exists, in every `NODE_ENV`. Real
tension resolved deliberately: CR-011's `register` dev-only `verificationUrl`
convenience (no email delivery yet, ADR-007 Pending) can't be reused here —
exposing the reset link only when the account exists would make the response
shape itself enumerable, exactly what this rule forbids. The service function
(`requestPasswordReset`) still returns the raw token to its caller, but
`auth.routes.ts` discards it unconditionally; tests and any manual/dev
verification call the service function directly instead, the same way other
behavior tests reach past the HTTP layer for a deliberately-hidden value.
`POST /v1/auth/reset-password` — body `{ token, password }` (12+ chars, same
policy as register), `200 { user }`; `400` with `invalid_reset_token` /
`reset_token_already_used` / `reset_token_expired` as appropriate. On
success, inside one transaction: updates `passwordHash`, marks every
outstanding token for that user used (including but not limited to the one
just consumed — a stale earlier link can't still work after a newer one
succeeded), and deletes every `sessions` row for that user
(`.claude/rules/security.md`: "a password change revokes every session of
that user" — same hard-delete shape ADR-013 already uses for logout, no soft
`revokedAt` path exists yet). Neither endpoint sets a session cookie; the
caller logs in again with the new password. Both endpoints share the
existing `AUTH_RATE_LIMIT` tier (5/min/IP).
Files: `packages/db/src/schema/password-reset-token.ts` (new),
`schema/index.ts`, `migrations/0013_useful_living_tribunal.sql`;
`packages/types/src/api/auth.ts` (`forgotPasswordRequestSchema`,
`resetPasswordRequestSchema`); `apps/api/src/modules/auth/tokens.ts`
(`PASSWORD_RESET_TOKEN_TTL_MS`), `auth.service.ts`
(`requestPasswordReset`/`resetPassword`), `auth.routes.ts` (the two routes),
`auth.routes.test.ts` (36 new assertions: enumeration-safety, token
issue/consume, expiry, reuse, cross-token invalidation, session revocation,
rate limiting); `docs/api.md`, `docs/database.md`.
Decisions: none new at the ADR level — implements the already-Accepted
ADR-006/ADR-013 requirements, doesn't change them.
Validation: `pnpm turbo run lint typecheck` clean across all 9 workspace
members; `apps/api` full suite 278/278 passing (was 265, +13 net after this
ticket's new describe blocks), `apps/web` 174/174 unaffected;
`pnpm --filter api build` clean. Live-verified end to end against this
environment's real local Postgres + a running `apps/api` (not just unit
tests, given the security-sensitive contract): registered a real user,
confirmed `forgot-password` returns byte-identical `204` for that email and
for a nonexistent one, obtained a real reset token via the service layer
(no HTTP path exists to leak it), logged in with the old password to capture
a session cookie, reset the password, confirmed the old session cookie now
401s on `/v1/auth/me`, confirmed login with the new password succeeds and
the old password is rejected. Dev server and scratch verification script
stopped/removed afterward — nothing left running or uncommitted.
Known limitations: `.claude/context/known-issues.md` KI-042 (new) — no
`/forgot-password`/`/reset-password` web screens exist yet (same gap shape as
KI-026's `/verify-email`), and unlike that endpoint this one can never expose
its token over HTTP even in dev, so real end-to-end use needs ADR-007's
still-Pending email delivery, not just a screen.
Follow-up: CR-058 (Redis-backed per-account auth rate limiting, blocked on
KI-014) and CR-061 (security headers, unblocked) are the two remaining
Security foundations tickets. CR-061 is the natural next task.

## 2026-09-17 — CR-061 — Security headers (`@fastify/helmet`)

Summary: `.claude/rules/security.md`'s Transport & headers section requires
CSP/`X-Content-Type-Options`/`frame-ancestors`/`X-Frame-Options`/
`Referrer-Policy` on API responses; KI-022 (re-confirmed by CR-047's audit)
tracked "zero security headers, API-wide" as the one remaining item this
ticket closes (the CSRF half of CR-061's original scope was already done by
CR-012).
Implementation: new `apps/api/src/plugins/security-headers.ts`
(`registerSecurityHeaders`), registering `@fastify/helmet` once, globally,
in `app.ts` — right after `registerErrorHandler`, before every route is
registered, so it applies to `/health`, `/docs` (Swagger UI), and every
`/v1/*` route alike. Unlike `csrf.ts` (deliberately scoped to `v1Routes`'s
own encapsulation context, since CSRF only matters for cookie-bearing `/v1`
mutations), generic response headers are worth sending everywhere this
process serves.
CSP deviates from helmet's raw defaults in two deliberate ways: (1)
`upgradeInsecureRequests` is explicitly removed — this app never terminates
TLS itself (a reverse proxy will, per ADR-013/CR-075, not yet built), and
the default directive would make a browser rewrite `/docs`'s own
same-origin sub-requests to `https://` in local dev, which has no listener
there, breaking Swagger UI entirely over plain `http://`; (2)
`frameAncestors` is tightened to `'none'` (helmet's default is `'self'`),
paired with `xFrameOptions: { action: 'deny' }` — this API is never meant to
be framed by anything. `styleSrc`/`imgSrc` stay permissive enough for
Swagger UI's own inline styles and embedded logo (`'unsafe-inline'` on
`styleSrc` is helmet's own default already, not a bar lowered for this app).
Files: `apps/api/package.json` (new dependency, `@fastify/helmet@^13.1.1` —
current major, targets Fastify 5 like this repo, same "adopt latest" pattern
every other `@fastify/*` dependency here follows), `apps/api/src/plugins/
security-headers.ts` (new), `apps/api/src/app.ts` (wires it in),
`apps/api/src/app.test.ts` (5 new assertions: headers present on `/health`,
`/v1/auth/me`, `/docs`; no `upgrade-insecure-requests`; `frame-ancestors
'none'`).
Decisions: none new at the ADR level — implements the already-Accepted
ADR-006 checklist item, doesn't change it.
Validation: `pnpm turbo run lint typecheck build` clean across all 9
workspace members; `apps/api` full suite 283/283 passing (was 278, +5 net);
`apps/web` unaffected (174/174, not re-touched). Live-verified the one real
regression risk, not just assumed safe: booted a real `apps/api` dev server
and drove `/docs` through a headless browser (`browser-automation` skill) —
`http://localhost:4000/docs/` (note the trailing slash — Swagger UI's own
relative-asset-resolution gotcha, not a CSP issue) renders the full
"Coffee Ride API 1.0.0" operations list including the new CR-060 auth
routes, zero console errors (no CSP violation reports), zero failed network
requests. `curl -i /docs` confirmed the actual header values sent
(`Content-Security-Policy` with `frame-ancestors 'none'`, no
`upgrade-insecure-requests`; `X-Frame-Options: DENY`; `Strict-Transport-Security`;
`Cross-Origin-Resource-Policy: same-origin`, consistent with ADR-013's
no-CORS single-origin posture). Dev server stopped afterward.
Known limitations: none new — KI-022 updated (this ticket resolves item (2)
of that entry; item (1), rate limiting, stays open as CR-058, blocked on
KI-014).
Follow-up: this closes the second of Security foundations' two remaining
tickets. Only CR-058 (Redis-backed per-account auth rate limiting) stays
open in that section, blocked on KI-014 (Redis unverified live in this
environment) — the Deployment section (CR-074+) is otherwise the next
logical work.

## 2026-09-17 — ADR-017 — `apps/api` production build bundles workspace source via `esbuild`, resolving KI-017

Summary: KI-017 (confirmed live-blocking since CR-011) documented that a
plain `node dist/server.js` crashes with `ERR_MODULE_NOT_FOUND` — `db`'s
compiled `client.ts` imports its sibling `schema/index.ts` with a
`.js`-suffixed NodeNext-style specifier that Node's native `.ts`
type-stripping doesn't rewrite. `tsx`/`vitest`/`tsc` all handle it fine;
only a real compiled boot under plain `node` was broken. Left unresolved
since CR-011 because nothing needed a real compiled boot before CR-074
(Dockerfile) — this ticket resolves it as that prerequisite, before CR-074
starts.
Decision (full reasoning in `docs/decisions.md` ADR-017): `apps/api`'s own
`build` script switches from `tsc -p tsconfig.json` to `esbuild`
(`apps/api/scripts/build.mjs`), bundling `src/server.ts` plus `db`/`types`/
`resilience`'s source into one `dist/server.js`. Chosen over the other
option KI-017 itself named (declaration-based `dist` exports on `db`/
`types`) specifically because it touches nothing about how those packages
ship to their other consumers (`tsx watch`, `vitest`) — only `apps/api`'s
own production artifact changes. Every real npm dependency (`fastify`,
`drizzle-orm`, `postgres`, `argon2`, `bullmq`, `ioredis`,
`@aws-sdk/client-s3`, `sax`, `zod`, the `@fastify/*` plugins) stays
external, resolved from `node_modules` at runtime exactly as before —
bundling a native addon (`argon2`) would trade one broken-module-resolution
problem for a differently-broken native-binding problem.
`external` is computed at build time as the union of `dependencies` across
`apps/api` + `db` + `types` + `resilience`, minus those three workspace
package names — not just `apps/api`'s own `package.json`, which doesn't
know about `db`'s own dependency on `postgres` at all. This surfaced a real,
second gap while implementing it (not hypothetical): marking `postgres`
external in the bundle wasn't sufficient by itself — pnpm's strict,
non-hoisted `node_modules` only symlinks a package's own declared
dependencies into its `node_modules`, so a plain `node dist/server.js`
still couldn't resolve the bare `postgres` specifier until `apps/api/
package.json` declared it directly (even though no file under `apps/api/
src` imports it — the bundle does, once `db`'s source is inlined). Fixed by
adding `postgres` as a direct `apps/api` dependency, documented in
`build.mjs`'s own comment.
Files: `apps/api/package.json` (new `esbuild` devDependency, new `postgres`
direct dependency, `build` script points at the new script), `apps/api/
scripts/build.mjs` (new), `apps/api/eslint.config.mjs` (scoped
`languageOptions.globals` override for `scripts/**/*.mjs` — the first
non-TS source file here, needed `URL` declared since TS files' own
type-checker normally covers this instead of ESLint's `no-undef`);
`docs/decisions.md` (ADR-017), `.claude/context/known-issues.md` (KI-017
resolved).
Decisions: ADR-017 (new) — see `docs/decisions.md` for the full decision,
rationale, and "what this does NOT mean"/"when to revisit" sections.
Validation: `pnpm turbo run lint typecheck build` clean across all 9
workspace members (24/24 tasks); full `apps/api` test suite 283/283 passing,
unaffected (`tsx watch`/`vitest` never read `dist/`). Live-verified the
actual regression, not just "builds without error": `NODE_ENV=test node
dist/server.js` (against this environment's real local Postgres) booted
cleanly — the exact `ERR_MODULE_NOT_FOUND` crash KI-017 documented is gone
— `GET /health` responded, and `POST /v1/auth/register` round-tripped
through the bundle end to end (argon2 hash, Drizzle insert, helmet headers,
rate limiting) with `201 Created`. Separately confirmed
`NODE_ENV=production` with this environment's local-only config still
correctly hits the unrelated, already-working CR-073 placeholder-refusal
guard — deliberately not conflated with the module-resolution fix this
ticket actually verifies. Inspected the bundle directly to confirm `argon2`
stayed a genuine external `import` (not inlined) and `db`'s exported symbols
(`createDbClient`, `passwordResetTokens`, ...) were actually present in the
output (inlined, not left as unresolved bare imports). Dev server/log files
cleaned up afterward.
Known limitations: none new. `packages/maps-2gis` still exports raw TS
source too, same as before — unaffected by this ADR since nothing in
`apps/api` consumes it yet, so it was never actually part of the blocking
gap.
Follow-up: CR-074 (`Dockerfile` for `apps/web`/`apps/api`) can now proceed —
`pnpm --filter api build && node dist/server.js` is a real, working
production boot to containerize. This is the next logical task.

## 2026-09-17 — CR-074 — `Dockerfile` for `apps/web`/`apps/api` + root `.dockerignore`

Summary: first open ticket in `docs/tasks.md`'s Deployment section, unblocked by
ADR-017 (previous entry). Added `apps/web/Dockerfile`, `apps/api/Dockerfile`, and a
root `.dockerignore`, each multi-stage with a non-root runtime user, per the
ticket's explicit requirements.
Implementation — `apps/web`: added `output: 'standalone'` to `next.config.ts`.
Three Docker stages: `deps` (copies every workspace member's `package.json` +
`pnpm-lock.yaml`, runs `pnpm install --frozen-lockfile` — layer-cache friendly,
edits to source never invalidate this), `builder` (copies full source, runs
`pnpm --filter web build`), `runner` (`node:24-alpine`, non-root `nextjs` user,
copies `.next/standalone` + `.next/static` + `public` with `--chown`, runs
`node apps/web/server.js`). `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is the one build
`ARG`, since Next inlines `NEXT_PUBLIC_*` values into the client bundle at build
time — deliberately never `MAPS_2GIS_API_KEY` (server-side geocoder/directions key,
`.claude/rules/maps.md`). `apps/web/public` didn't exist yet; added
`apps/web/public/.gitkeep` so the runner stage's `COPY` doesn't fail on a fresh
checkout.
Implementation — `apps/api`: same `deps`/`builder` shape, `builder` runs
`pnpm --filter api build` (ADR-017's esbuild bundle), then
`pnpm --filter=api deploy --prod /prod/api` to prune the result to a real
production-only dependency set (no devDependencies) rather than shipping the
whole monorepo's `node_modules` into the runtime image. Two things were needed to
make that deploy step actually work correctly, both found by testing three
variants on the host before writing the Dockerfile, not assumed: (1)
`inject-workspace-packages=true`, set via the `npm_config_inject_workspace_
packages` env var scoped to that one `RUN` command — without it `pnpm deploy
--prod` refuses with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, and the tool's own
suggested `--legacy` fallback was tried and rejected: it resolved the entire
workspace lockfile (786 packages, including devDependencies and the root
`prepare` husky script) instead of a scoped prune, and pnpm itself marks it
"Experimental!". Deliberately not written to a repo-wide `.npmrc`, since that
setting also changes how ordinary `pnpm install` resolves every workspace:*
dependency everywhere else (symlink vs. a copied/injected dependency) — a real
dev-workflow behavior change with no reason to apply outside this one Docker
build step. (2) `apps/api/package.json` gained `"files": ["dist"]` — without it,
pnpm's pack step falls back to the root `.gitignore` for exclusions (no `files`
field, no `.npmrc`), and `dist` is gitignored repo-wide, so the deploy was
silently dropping the one directory it exists to ship. `runner`
(`node:24-alpine`, non-root `fastify` user) copies the pruned `/prod/api`
directory verbatim and runs `node dist/server.js`.
Decisions: none new at the ADR level — this is CR-074 exactly as scoped in
`docs/tasks.md`, no architecture change.
Validation: `pnpm turbo run lint typecheck build test` clean across all 9
workspace members (283 `apps/api` tests, 174 `apps/web`, 90 `ui`, 15 `resilience`,
11 `maps-2gis`, all passing, all unaffected by the `next.config.ts`/`package.json`
edits). Docker's daemon is still unreachable in this environment (KI-019) — a
real `docker build`/`docker run` could not be executed this session (see KI-043,
new). Instead, live-verified the two pieces a Docker build would actually
exercise, directly on the host: ran the real `pnpm --filter web build` with
`output: 'standalone'` and inspected the actual traced output shape (confirmed
the `apps/web/server.js` entry path the Dockerfile's `CMD` uses, and that
`.next/static`/`public` need copying separately — Next's own documented
standalone caveat); ran the exact `pnpm --filter=api deploy --prod` command the
Dockerfile's builder stage runs, then ran `node dist/server.js` from inside that
pruned output directory against this environment's real local Postgres —
`GET /health` responded `200` with helmet/rate-limit headers present, confirming
the pruned, production-only `node_modules` is sufficient and argon2's native
binding still resolves correctly from within it.
Known limitations: KI-043 (new) — neither Dockerfile has had an actual `docker
build`/`docker run` executed against it; KI-001 narrowed (the two application
images now exist; a production manifest/reverse proxy putting them behind one
origin is still CR-075, not built yet).
Follow-up: CR-075 (production manifest: reverse proxy, TLS, resource limits,
restart policy) is the next logical Deployment-section task — it's what actually
wires these two images together behind ADR-013's single origin.

## 2026-09-17 — ADR-018 / CR-075 — Production manifest: Caddy reverse proxy, TLS, resource limits, restart policy

Summary: next open Deployment-section ticket after CR-074. `docs/architecture.md`
calls a reverse-proxy choice a "production provider choice" requiring an ADR —
recorded as ADR-018, then implemented as `docker-compose.prod.yml` + `deploy/
Caddyfile`.
Decision (full reasoning in ADR-018): Caddy 2, not nginx+certbot or Traefik —
automatic ACME/TLS with no second container or renewal cron (nginx+certbot's
classic silent-renewal-failure footgun), and this topology (two fixed services)
gets nothing from Traefik's dynamic discovery. Caddy proxies to `web` only, never
to `api` directly — `apps/web/next.config.ts`'s `rewrites()` already forwards
same-origin `/api/v1/*` to `apps/api` server-side (working since CR-011), so
routing it a second time at the proxy layer would duplicate that logic. `api`
publishes no host port at all in the prod manifest, reachable only from `web`
over the compose network.
Implementation: `docker-compose.prod.yml` (new, root) — three services (`caddy`,
`web`, `api`), `restart: unless-stopped` (the plain, non-Swarm field) plus
`deploy.resources.limits.cpus`/`memory` on each (Compose V2 honors resource
limits outside Swarm mode; `deploy.restart_policy` does not, hence the split
between the two mechanisms — documented inline so a future edit doesn't
"simplify" restart handling into the Swarm-only field by mistake). Deliberately
excludes Postgres/Redis/S3 (assumes `DATABASE_URL`/`REDIS_URL`/`S3_*` already
point at real, externally provisioned endpoints — where those actually run in
production stays an open decision per `docs/architecture.md`) and runs no
migration step (CR-076's job, unbuilt — adding one here now would ship exactly
the multi-instance race CR-076 exists to prevent). `api`'s `WEB_ORIGIN` is
derived as `https://${DOMAIN}` in the compose file itself rather than set as an
independently-configured variable, so it can't drift out of sync with `DOMAIN`
and silently break the CSRF Origin/Referer check (ADR-013,
`apps/api/src/plugins/csrf.ts`). New `.env.example` entries: `DOMAIN`,
`ACME_EMAIL` (meaningless in local dev, required only for this file).
`docs/architecture.md`'s Infrastructure section cross-links ADR-018.
Discovered issues (not fixed here, both recorded as new known issues rather than
silently left implicit): KI-044 — whether `apps/api`'s per-IP rate limiter
(already flagged in-memory/single-instance by KI-014/KI-022) sees each real
client's IP or just `web`'s single internal IP depends on whether Next's own
rewrite forwards `X-Forwarded-For` through to `api`, which was not checked;
relevant to CR-058's already-planned rate-limiting hardening, not addressed in
this ticket. KI-045 — this manifest has never run end to end (see Validation).
Validation: `pnpm turbo run lint typecheck build test` stayed green (24/24
build/lint/typecheck tasks, all 5 test suites, fully cached — this ticket touched
no application source). `docker compose -f docker-compose.prod.yml config`
validated clean with realistic env values: `WEB_ORIGIN` correctly resolves to
`https://<DOMAIN>`, `web`/`api` correctly get no published ports, resource
limits and restart policy present on every service. Could not run an actual
`docker compose up` (Docker's daemon still unreachable this session, KI-019) or
`caddy validate` (no local `caddy` binary) — `deploy/Caddyfile` was instead
reviewed by hand against Caddy's documented global-options + site-block +
`reverse_proxy` syntax. Caddy's ACME challenge additionally needs a real public
DNS record pointing at a real host regardless of Docker access, so this manifest
could never be fully verified in any local/CI sandbox — said plainly rather than
implied otherwise (KI-045, new).
Known limitations: KI-045 (new, this manifest unverified end to end), KI-044
(new, rate-limiter IP-trust gap through the new proxy hop). KI-001 further
narrowed — the reverse proxy piece of "no deployment artifacts" is now built;
Postgres/Redis/S3 production hosting stays the one open item there.
Follow-up: CR-076 (migrations as an explicit deploy step) is the next logical
Deployment-section task — the natural next thing this manifest needs before a
real multi-instance deploy is safe.

## 2026-09-17 — CR-076 — Migrations as an explicit deploy step, made concurrency-safe

Summary: KI-002 ("nothing says who runs migrations on the server; running it on
boot races when several API instances start together") had two parts: `apps/
api` already never ran migrations on boot (confirmed, unchanged), but
`packages/db/src/migrate.ts` itself was never actually verified safe under
concurrent invocation — it wasn't, and this ticket found and fixed a real bug,
not a hypothetical one.
Investigation: read drizzle-orm's actual postgres-js migrator implementation —
it reads the last-applied migration, then applies missing ones inside one
transaction, with no lock across that read+apply. Proved this live before
touching anything: launched two `pnpm --filter db db:migrate` processes at the
same instant against a fresh database. One reliably failed with `duplicate key
value violates unique constraint "pg_namespace_nspname_index"` on `CREATE
SCHEMA IF NOT EXISTS "drizzle"` — exactly KI-002's race, reproduced, not
assumed.
Fix: `packages/db/src/migrate.ts` now wraps the `migrate()` call in a
session-level Postgres advisory lock (`pg_advisory_lock`/`pg_advisory_unlock`,
fixed key), released in a `finally`. A `client.reserve()` connection was tried
first for an explicit same-session guarantee but rejected — drizzle's
postgres-js driver reaches into `client.options` for type-parser setup, which
a `ReservedSql` doesn't expose, so `drizzle(reserved)` threw at construction.
Kept the simpler approach instead: the lock and the migration both run through
the same `{ max: 1 }` client, which only ever holds one physical connection.
Re-ran the identical concurrent-launch test after the fix, same fresh
database: both processes now exit `0` — the second one's log shows real
Postgres `NOTICE`s ("schema \"drizzle\" already exists, skipping", "relation
\"__drizzle_migrations\" already exists, skipping"), proving it genuinely
waited on the lock rather than happening to get lucky, then found nothing left
to apply and completed as a clean no-op. Also simulated (without a Docker
daemon) exactly the file set the new `packages/db/Dockerfile` copies —
workspace `package.json`s installed, then only `packages/db/src` +
`packages/db/migrations` added — and ran `pnpm --filter db db:migrate` from
that reduced tree against a real throwaway database, confirming the image's
planned contents are actually sufficient before trusting the Dockerfile.
Implementation: new `packages/db/Dockerfile` — a small, single-purpose image
(runs `packages/db/src/migrate.ts` via `tsx` from source, not a production
bundle like `apps/web`/`apps/api`'s CR-074 images, since this is a short-lived
one-shot job where CR-074's image-size discipline doesn't apply the same way),
non-root user. `docker-compose.prod.yml` gained a `migrate` service behind a
`migrate` Compose profile — confirmed via `docker compose config --services`
that it's entirely absent from a plain `docker compose up` and only appears
with `--profile migrate` — documented as
`docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate`,
run explicitly before rolling `api` to a version needing new migrations.
Decisions: none new at the ADR level — this operationalizes CR-076 exactly as
scoped in `docs/tasks.md`, no architecture change beyond what ADR-018 already
covers for the compose file's shape.
Validation: `pnpm turbo run lint typecheck build test` clean (`packages/db`'s
own `eslint`/`tsc --noEmit` re-run directly, not just trusting a turbo cache
hit, given the file that changed). `docker compose -f docker-compose.prod.yml
--profile migrate config` validated clean, `migrate` service present with the
right build context/Dockerfile/env; without the profile flag, `config
--services` confirmed `migrate` doesn't appear at all. Could not run an actual
`docker build`/`docker compose run` (Docker's daemon still unreachable this
session, KI-019/KI-043/KI-045) — the on-host simulation described above is
what actually stands in for it, not just an assumption.
Known limitations: KI-002 resolved (moved to Resolved section, full account
there). The new `packages/db/Dockerfile` shares KI-045's "never run through a
real `docker build`" gap — noted there rather than opening a fourth near-
identical entry.
Follow-up: with CR-074/075/076 all done, `docs/tasks.md`'s Deployment section
remaining tickets are CR-077 (Redis hardening), CR-078 (Postgres backups),
CR-079 (structured logging/error reporting), CR-080 (CI gaps), CR-081 (full
production env var set + deployment documentation), CR-082 (pin MinIO/review
base images) — CR-079 (structured logging) is the natural next one, since
`apps/api/src/app.ts` already branches its pino transport on `NODE_ENV` in
anticipation of it.

## 2026-09-17 — CR-079 — Request-id correlation and a single error-reporting funnel (KI-006)

Summary: `apps/api` already logged structurally in production (JSON via pino,
CR-079's own comment in `app.ts` said "builds on this later"), but had no
request-id correlation across the CR-075 Caddy -> web -> api hop, and no
single funnel an unexpected 500 and a background job failure both went
through — each logged independently, with no extension point for a future
external error tracker.
Investigation: checked `docs/decisions.md`/`docs/architecture.md`/
`docs/product.md` for an existing error-tracking vendor decision — none
exists; ADR-016's own rationale ("no metrics/observability hook ... add when
actually needed, not speculatively") confirms this was deliberately
undecided. Wiring a specific vendor SDK (Sentry or otherwise) would have
invented an architectural choice nobody made, so this ticket builds the
funnel plus a generic optional webhook sink instead — the same "null is a
supported degraded mode" shape `plugins/s3.ts`/`redis.ts` already use for
undecided/not-yet-configured integrations.
Implementation: new `apps/api/src/lib/request-id.ts` (`generateRequestId`)
wired into `app.ts` as Fastify's `genReqId` — reuses a valid inbound
`X-Request-Id` (bounded charset/length; an untrusted header feeding straight
into every log line is a log-injection/volume surface, not just cosmetic),
otherwise generates a UUID; an `onSend` hook echoes it back as the response
header. `app.ts`'s pino config gained `base: { service: 'api' }` for when
api/migrate/web all ship to one log pipeline. New
`apps/api/src/plugins/error-reporting.ts` decorates
`app.reportError(error, message, context?, logger?)`: always logs
structurally (the always-on mechanism that alone satisfies "must be
visible"); if `ERROR_REPORTING_WEBHOOK_URL` is configured, additionally
POSTs the error as JSON via `callWithResilience` with one _shared_
`CircuitBreaker` (`.claude/rules/resilience.md`: shared across every call,
not per-call) — fire-and-forget, never throws back into the caller.
`error-handler.ts`'s two `>=500` branches and `queue.ts`'s
`worker.on('failed', ...)` (a job that exhausted its retries — the actual
"background job failure" resilience.md means) now go through
`app.reportError` instead of logging directly; connection-level `.on('error',
...)` handlers (Redis, BullMQ queue/worker) were deliberately left logging
directly — those fire repeatedly on ordinary outage noise and would trip the
webhook sink's breaker on transient hiccups instead of real failures.
`env.ts` gained `ERROR_REPORTING_WEBHOOK_URL` (optional, `z.preprocess`
normalizes an empty string to `undefined` before the `.url()` check — see
Discovered issues below for why that matters). `docker-compose.prod.yml`'s
`api` service and `.env.example` both wire it through, documented as
optional/deployment-only.
Decisions: none new at the ADR level — a real external error-tracking vendor
stays an open, undecided choice (consistent with ADR-016); this ticket only
builds the seam for one.
Validation: `pnpm turbo run lint typecheck build test` — 29/29 tasks green
(a stale `.next` cache from an earlier session made `apps/web`'s build fail
independently of this ticket's changes; deleting it and rebuilding fixed it
before this ticket's own validation ran). `apps/api`'s full suite — 299
tests, including new coverage in `lib/request-id.test.ts` (valid/oversized/
malformed/repeated header handling),
`plugins/error-reporting.test.ts` (structured logging with no sink
configured, webhook POST + payload shape, webhook failure logged as a
warning not thrown, breaker trips after 5 consecutive failures without a
sixth `fetch` call), and `app.test.ts` (a real `.inject()` round trip:
inbound id reused and echoed, one generated and echoed when absent, a
malformed one rejected and replaced) — ran live against real HTTP request
injection, not just unit-level. `queue.test.ts` extended to capture the
`Worker`'s `'failed'` handler and assert it calls `app.reportError` with the
right job context. Live-observed the real JSON log line during the full test
run: `{"level":30,...,"service":"api","reqId":"<uuid>",...}` — confirms
`base`/`genReqId` actually take effect, not just typecheck.
Discovered issues (KI-046, new): `docker-compose.prod.yml`'s `api` service
wires every optional env var through `${VAR}` unconditionally (`REDIS_URL`,
`S3_ENDPOINT`, now `ERROR_REPORTING_WEBHOOK_URL`) — Compose substitutes an
_empty string_, not an absent variable, for one unset in `.env`, which a
bare `z.string().url().optional()` rejects (only `undefined` counts as
absent), crashing boot. Fixed for the new field
(`ERROR_REPORTING_WEBHOOK_URL`'s `z.preprocess`, confirmed live via `tsx`
with an empty-string input); `REDIS_URL`/`S3_ENDPOINT` carry the same
pre-existing gotcha, out of scope here (unrelated-changes discipline) —
recorded as KI-046 rather than silently left for a real deploy to discover
with unset Redis.
Known limitations: KI-006 resolved (moved to Resolved section). KI-046 (new,
see above). No error-tracking vendor is chosen yet — the webhook sink is a
generic seam, unverified against any real endpoint (no vendor/credential
exists to verify against, consistent with `.claude/rules/resilience.md`'s
extension-point pattern for undecided integrations).
Follow-up: CR-077 (Redis hardening) and CR-078 (Postgres backups) are the
two Deployment-section tickets that were open before CR-079 and remain open
after it; CR-080 (CI gaps), CR-081 (env var set + docs), CR-082 (pin MinIO)
round out the section. KI-046 (the Compose empty-string gotcha for
`REDIS_URL`/`S3_ENDPOINT`) is worth folding into whichever of CR-077/CR-081
actually touches those variables next, rather than opening a dedicated
ticket for a two-line fix.

## 2026-09-18 — CR-077 — Redis hardening: password, AOF persistence (KI-003)

Summary: next open Deployment-section ticket after CR-079. KI-003 flagged the
local-dev `redis` service (`docker-compose.yml`) as unauthenticated and
without AOF persistence — a container restart silently dropped queued
notification jobs (CR-050), contradicting `.claude/rules/resilience.md`
("a failed background job must never silently disappear"). KI-003's "no
healthcheck" half was actually already stale: CR-009/CR-010 had added a
`redis-cli ping` healthcheck back on 2026-09-13; that correction is folded
into this ticket's close-out rather than opened as a separate note.
Investigation: `apps/api/src/redis.ts`'s `createRedisClient` is a thin
`ioredis` factory over a full connection URL — `ioredis` parses
`redis://:<password>@host:port` natively, so authenticating needed no
application code change, only the URL value. `docker-compose.prod.yml`
(ADR-018) runs no Redis service of its own — it assumes `REDIS_URL` already
points at a real, externally provisioned instance — so this ticket's scope
is the local-dev compose file only; a production instance's password/
persistence is that instance's own operator's responsibility.
`.github/workflows/ci.yml` runs its own separate `redis` GitHub Actions
service (not `docker-compose.yml`) and sets `REDIS_URL` to an unauthenticated
local value — confirmed unaffected either way, since
`queue.test.ts`/`health.test.ts` both fully mock `ioredis` rather than
connecting live.
Implementation: `docker-compose.yml`'s `redis` service gained `command:
redis-server --requirepass redis-dev-only --appendonly yes` — a literal
dev-only password, the same pattern this file already uses for `postgres`'s
`POSTGRES_PASSWORD`/`minio`'s `MINIO_ROOT_PASSWORD` (plain values, not
`${VAR}`-substituted like `docker-compose.prod.yml`, since this file is
explicitly "local development infrastructure only" and bound to
`127.0.0.1`). Healthcheck updated to `redis-cli --no-auth-warning -a
redis-dev-only ping`. `.env.example`'s `REDIS_URL` updated to
`redis://:redis-dev-only@localhost:6379` to match, with a comment steering a
production value toward a real, separately-hardened instance.
Decisions: none new at the ADR level — this operationalizes CR-077 exactly
as scoped in `docs/tasks.md`.
Validation: `docker compose -f docker-compose.yml config` parses cleanly
with the new `command:`/healthcheck lines (Docker's daemon is still
unreachable in this environment, KI-019, so a live authenticated boot was
not exercised). `pnpm turbo run lint typecheck build test`: 29/29 tasks
green, 299/299 `apps/api` tests passing (this ticket touched no application
source — the full suite re-run confirmed nothing regressed).
Known limitations: KI-003 resolved (moved to Resolved section). Production
Redis hardening (password, persistence) stays outside this repo's compose
manifests, per ADR-018 — an operator's responsibility wherever that instance
is actually hosted.
Follow-up: CR-078 (Postgres backups) is the next Deployment-section ticket
that was open before this one and remains open; CR-080 (CI gaps), CR-081
(env var set + docs), CR-082 (pin MinIO) round out the section, no fixed
order decided among them.

## 2026-09-19 — CR-078 — PostgreSQL backups + a restore actually verified

Summary: the next open Deployment-section ticket after CR-077/CR-079. Unlike
every other open Deployment ticket, this one didn't have to stay
documentation-only against an unreachable Docker daemon — this environment's
local Postgres (used since CR-004, outside Docker) is genuinely reachable, so
"a restore actually verified" (the ticket's own title, not just "a script
that looks right") was achievable live in this session.
Investigation: `docker-compose.prod.yml`/ADR-018 deliberately run no Postgres
service of their own — production hosting is undecided, `DATABASE_URL` is
assumed to already point at a real, externally provisioned instance. A
backup mechanism therefore can't assume a specific host or container; it has
to be connection-string-driven, the same shape `packages/db/src/migrate.ts`
already uses. No `docs/deployment.md` exists — `docs/database.md` already
owns `packages/db`'s operational rules (ADR-012's time rules live there), so
a new "Backups" section there is the natural home rather than inventing a
new doc.
Implementation: `packages/db/scripts/backup.sh` (`pg_dump --format=custom`
against `DATABASE_URL`, timestamped output file, `BACKUP_DIR`/
`BACKUP_RETENTION_DAYS`-configurable, default 7-day pruning) and
`packages/db/scripts/restore.sh` (`pg_restore --clean --if-exists
--no-owner --no-privileges`, one positional backup-file argument) — plain
shell, no new npm dependency, same "boring, explicit" precedent as
`migrate.ts`. New `packages/db/package.json` scripts `db:backup`/`db:restore`.
`docs/database.md` gained a "Backups" section: the mechanics above, an
explicit statement that backup _destination_ (local disk vs. offsite/S3
sync) is left to whoever operates the real Postgres instance — the same
reasoning ADR-018 already used for leaving that instance's host undecided —
plus a daily-cron scheduling example. `.gitignore` gained
`packages/db/backups/` (the scripts' default output directory; real backup
files are never repository content).
Decisions: none new at the ADR level — same "implementation, not an
architectural decision" precedent as CR-076/CR-077/CR-079. Backup
destination stays exactly as undecided as Postgres hosting itself (ADR-018),
deliberately not resolved here.
Validation — this is the part that matters for this ticket's own acceptance
criterion: inserted one marker row (`cr078-backup-verify@example.com`) into
the real local `coffee_ride_dev` database (the only non-empty table in an
otherwise-empty dev database, so the restore had real data to actually
carry, not just an empty schema); ran `pnpm --filter db db:backup`; created
a throwaway scratch database (`coffee_ride_cr078_restore_test`); restored
the produced `.dump` file into it via `restore.sh`; compared `count(*)`
across all 14 real tables between source and restored database — every one
matched exactly (13 at `0`, `users` at `1`); separately confirmed the marker
row's `id`/`email`/`display_name` were byte-identical between the two
databases, not just a matching count. Cleaned up afterward: deleted the
marker row from the real dev database, dropped the scratch database,
deleted the test backup file — nothing from this verification pass was left
behind. `pnpm turbo run lint typecheck build test` (via `--filter='!web'`,
`apps/web`'s build run separately with `NODE_ENV=production` — see Discovered
issues below): 25/25 tasks green, 299/299 `apps/api` tests passing (this
ticket touched no application source).
Discovered issues: none new — re-hit KI-038 (`next build` crashes under an
inherited `NODE_ENV=development` from sourcing the root `.env` into the same
shell as `apps/api`'s DB env vars), already documented with its exact
workaround; not a regression, confirmed by following that entry's own
"override NODE_ENV=production for the build command" workaround, which
worked cleanly.
Known limitations: none new. The restore was verified against this
environment's real local Postgres, not a fresh disaster-recovery scenario on
a from-scratch host — that's the same class of "verified locally, not
against the exact real deploy target" gap KI-043/KI-045 already record for
the Dockerfiles/production manifest, not a new one worth a separate entry.
Follow-up: CR-080 (CI gaps), CR-081 (full production env var set +
deployment documentation), CR-082 (pin MinIO/review base images) remain
open, no fixed order decided among them.

## 2026-09-19 — CR-080 — CI gaps: MinIO service, Playwright e2e job (KI-007)

Summary: the next open Deployment-section ticket after CR-078. KI-007 named
three gaps in `.github/workflows/ci.yml`: no MinIO service, no migration
step, no Playwright job. The migration-step complaint turned out to be
stale — `pnpm --filter db db:migrate` has been a real CI step since CR-011
(`git log` confirms); KI-007's text was simply never corrected after that
landed. The other two were real.
Investigation: `apps/web/src/app/page.tsx` (`/`) has been the real discovery
screen since CR-024, calling the real `GET /v1/rides` through `apps/web`'s
own `/api/v1/*` rewrite — not the CR-002 bootstrap placeholder
`apps/web/e2e/home.spec.ts` still asserted on ("Платформа собирается...",
copy that no longer exists anywhere in the app). Wiring that spec into CI
unmodified would have just added an immediately-failing check. This also
meant `apps/api` now has to be running for any e2e spec to work at all —
`playwright.config.ts`'s `webServer` only ever started `apps/web`.
`.claude/rules/testing.md` names three critical-journey specs (discover+
register, organizer create+publish, organizer view participants) that don't
exist yet — no ticket owned writing them; out of scope for "wire CI", so
opened as a new ticket (CR-092) rather than silently expanding scope or
leaving it untracked (same precedent as CR-088..091). Confirmed
`apps/api`'s existing S3 test suite (`route.routes.test.ts`) mocks
`@aws-sdk/client-s3` at the module level — no test anywhere hits a real
store, which is exactly what KI-015 has flagged as unverified since CR-006,
blocked every session so far by the local sandbox's unreachable Docker
daemon. A GitHub Actions runner has real Docker for service containers —
different environment, actually able to close that gap for the first time.
Implementation: `ci.yml` gained a `minio` service (`quay.io/minio/minio:
RELEASE.2025-09-07T16-13-09Z`, same pinned tag as `docker-compose.yml`), a
"Create MinIO bucket" step (`aws s3 mb` against it — `ubuntu-latest` ships
`aws-cli` preinstalled, no extra container/binary needed), `S3_*`/
`AUTH_SECRET`/`WEB_ORIGIN`/`RUN_LIVE_S3_TESTS` added to the job's `env:`
(the first two were never needed before — nothing booted a real `apps/api`
process in this job until now), a Playwright browser install step, and an
"E2E tests" step after Build. New `apps/api/src/modules/rides/
route-storage.live.test.ts`: a real, unmocked upload/download/delete round
trip through `route-storage.ts`'s exported functions. Gated on
`RUN_LIVE_S3_TESTS === '1'`, not merely "are `S3_*` set" — a local `.env`
has them configured for MinIO whether or not MinIO is actually running
(docker-compose.yml/.env.example's defaults), and this session hit exactly
that false positive: the first version of this gate (S3_*-presence only)
failed against this environment's real `.env` instead of skipping, since
Docker/MinIO aren't running here (KI-019). `apps/web/playwright.config.ts`'s
`webServer` became a two-entry array (Playwright's own supported
multi-server ordering since 1.34): `apps/api` first (`tsx src/server.ts`,
no `--watch`, waited on `/health`, env defaulted to the same local-dev
values `docker-compose.yml` uses so a developer needs nothing exported),
then `apps/web` unchanged — this is what makes `pnpm test:e2e` work
identically in CI and local dev without any CI-YAML-specific
background-process handling. `e2e/home.spec.ts` rewritten: asserts the real
page title and, deliberately not assuming an empty database (CI's is,
local dev's usually isn't after a while), accepts either the empty state or
at least one real ride card — proving the full round trip resolved instead
of hanging on the loading skeleton or falling into the error state.
Decisions: none new at the ADR level — same "implementation, not an
architectural decision" precedent as CR-076/077/078/079.
Validation — the part that matters here, since none of this can be proven
by an actual GitHub Actions run from this sandbox: ran `pnpm test:e2e`
locally for real, from a clean state (killed two stale dev-server processes
first — see Discovered issues) — the new two-webServer config started a
real `apps/api` and `apps/web` and the rewritten spec passed end to end
against this environment's real local Postgres, in ~12s total including
both servers' startup. Separately ran `route-storage.live.test.ts` twice:
once with no `RUN_LIVE_S3_TESTS` (this environment's normal state) —
skipped cleanly; once with it forced to `1` — genuinely attempted a real
connection and failed with `RouteStorageError` (no MinIO running here),
proving the gate itself discriminates correctly before trusting it to guard
CI's real run. `pnpm turbo run lint typecheck build test` (via
`--filter='!web'`, `apps/web` built separately per KI-038's own documented
workaround): 25/25 tasks green, 299 passed + 1 skipped `apps/api` tests
(the new live-S3 file, correctly skipped locally).
Discovered issues: found (and fixed, not just noted) a real self-inflicted
one while investigating why the rewritten e2e spec hung on the loading
skeleton against an already-running local dev server: CR-078's own earlier
`NODE_ENV=production pnpm --filter web build` in this same session had
overwritten `apps/web/.next` with production output, so the long-running
`next dev` process from before that (pid still listening on :3000) was
serving stale HTML referencing chunk paths that no longer existed on disk —
404s on every `_next/static/chunks/*` request, so React never hydrated and
the discovery fetch never ran. Killed both stale processes (`apps/api`'s
and `apps/web`'s) and re-ran clean; not a bug in this ticket's own changes,
but a real trap worth naming for any future session that runs a production
build and a dev server in the same working tree without restarting the
latter afterward.
Known limitations: KI-007 resolved (moved to Resolved section). The
MinIO-service/CI-job combination itself is unverified by an actual GitHub
Actions run (none available in this sandbox) — same category of gap as
KI-043/KI-045's Docker artifacts, not a new one. CR-092 (critical-journey
e2e specs) is new and open.
Follow-up: CR-081 (full production env var set + deployment documentation),
CR-082 (pin MinIO/review base images), and the new CR-092 (critical-journey
e2e specs) remain open, no fixed order decided among them.

## 2026-09-19 — CR-081 — Full production env var set + deployment documentation (KI-046)

Goal: close the remaining Deployment-section gap CR-080 left open —
`.env.example` completeness and an actual deployment procedure — plus
finish KI-046, which CR-079 only partially closed.

Investigation: cross-checked `.env.example` line by line against every
variable `docker-compose.prod.yml`'s `api`/`web`/`caddy` services actually
consume — already complete, nothing to add. The real gap was that no
`docs/deployment.md` existed at all: `docs/architecture.md`, ADR-018, and
`docker-compose.prod.yml`'s own comments each document one slice (reverse
proxy choice, migration profile) but nothing walked an operator through an
actual deploy end to end. Separately, KI-046 (`docker-compose.prod.yml`
substitutes an empty string, not an absent variable, for an unset optional
env var — confirmed by CR-079 via `docker compose ... config`) was only
fixed for `ERROR_REPORTING_WEBHOOK_URL`; `REDIS_URL`/`S3_ENDPOINT` still had
the bare, crash-on-empty-string `z.string().url().optional()` shape.

Implementation: `apps/api/src/env.ts` — applied the same `z.preprocess`
empty-string-to-`undefined` normalization already used for
`ERROR_REPORTING_WEBHOOK_URL` to `REDIS_URL` and `S3_ENDPOINT` (the only
other two `.url().optional()` fields; the remaining `S3_*` fields are plain
`z.string().optional()`, which already accepted `''` without crashing — no
change needed there). New `apps/api/src/env.test.ts` (didn't exist before):
covers the empty-string normalization for both fields, a genuinely malformed
URL still being rejected, a real URL still being accepted, and the existing
production-placeholder-refusal behavior — this correctness-critical parsing
logic now has direct test coverage instead of only ever being exercised
indirectly through other suites. New `docs/deployment.md`: prerequisites (a
Docker + Compose v2 host, DNS already pointed at `DOMAIN`, externally
provisioned Postgres/Redis/S3 — ADR-018 leaves that hosting choice open,
this doc doesn't invent one), preparing `.env`, first-boot order (`--profile
migrate run --rm migrate` before `up -d --build`, per CR-076), verification
(`/health`'s per-dependency semantics, Caddy TLS, pino/request-id logs),
redeploying, rollback limitations (no automated down-migrations — a
schema-incompatible rollback needs a manually written reverse migration),
and a pointer to `docs/database.md`'s Backups section rather than
duplicating it. States plainly, once, that none of this has been exercised
by a real `docker compose up` in any session (KI-043/KI-045) — documented
and reviewed, not live-verified.

Decisions: none new at the ADR level — an implementation fix (KI-046) plus a
documentation addition, same "not an architectural decision" precedent as
CR-076/077/078/079/080.

Validation: `apps/api/src/env.test.ts` — 6/6 new tests pass in isolation
(`vitest run src/env.test.ts`). Full monorepo check with a real local
`DATABASE_URL`: `pnpm turbo run lint typecheck build test --filter='!web'`
— 25/25 tasks green, 305 passed + 1 skipped `apps/api` tests (up from 299 —
the 6 new ones), no regressions. `apps/web` built separately
(`NODE_ENV=production pnpm --filter web build`, KI-038's documented
workaround): succeeded, all 17 routes. `docs/deployment.md` itself is
documentation, not code — reviewed against `docker-compose.prod.yml`/
`deploy/Caddyfile`/every referenced CR/ADR for accuracy, same "can't be
live-verified in this sandbox" caveat as the rest of the Deployment section.

Known limitations: KI-046 fully resolved (moved to reflect that in
`.claude/context/known-issues.md` — it was already filed under Resolved
despite its prior "open (partially mitigated)" status text, a pre-existing
filing quirk, not something this entry introduces). `docs/deployment.md`
carries the same standing "reviewed, not live-verified" caveat as every
other Deployment artifact (KI-043/KI-045) — restated explicitly in the doc
itself rather than left implicit.

Follow-up: CR-082 (pin MinIO/review base images) is the one remaining
Deployment-section ticket. CR-092 (critical-journey e2e specs) and CR-083
(registration idempotency) remain open, tracked separately, no fixed order
decided among the three.

## 2026-09-19 — CR-082 — Fix Dependabot docker/docker-compose coverage (base image review)

Goal: close the last open Deployment-section ticket — pin `minio/minio` to
a release tag (already done) and review base image versions.

Investigation: grepped the whole repo for `minio/minio`/`:latest` —
`docker-compose.yml` and `.github/workflows/ci.yml` already pin MinIO to
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`, landed in CR-009
(2026-09-13). Same "ticket text already stale" shape as CR-080's
migration-step third. The real question was how the remaining floating
base-image tags (`node:24-alpine` in all three Dockerfiles,
`postgres:17-alpine`/`redis:8-alpine` in `docker-compose.yml`,
`caddy:2-alpine` in `docker-compose.prod.yml`) actually get reviewed over
time — checked `.github/dependabot.yml`'s one `docker` entry
(`directory: '/'`) against GitHub's own docs and current Dependabot
behavior (WebFetch + WebSearch, since this is real external tooling
behavior, not project-internal state). Found two real, previously
undiscovered gaps: (1) `docker` and `docker-compose` are separate
Dependabot ecosystems (the latter reached GA February 2025) — no
`docker-compose` entry existed anywhere in this repo's config, so
`docker-compose.yml`/`docker-compose.prod.yml`'s `image:` references
(postgres/redis/minio/caddy) have never been covered by any Dependabot
update, ever. (2) The `docker` ecosystem only scans the exact `directory`
given, with no subdirectory recursion — this repo has no Dockerfile at the
repo root at all (all three live nested under `apps/web`, `apps/api`,
`packages/db`), so the existing `directory: '/'` entry has never actually
scanned any of them either. Net effect: nothing that sets a base-image
version anywhere in this repo has ever actually been reviewed by
Dependabot, despite `dependabot.yml` appearing to include a working
`docker` entry.

Implementation: `.github/dependabot.yml` — replaced the one non-functional
`docker` entry with three `docker` entries, one per real Dockerfile
directory (`/apps/web`, `/apps/api`, `/packages/db`), plus a new
`docker-compose` entry (`directory: '/'`) covering both compose files. Same
weekly schedule as every other ecosystem already configured. No base image
version changes — `node:24-alpine`/`postgres:17-alpine`/`redis:8-alpine`/
`caddy:2-alpine` stay intentional major/minor floating tags (not
`:latest`, not digest-pinned); Dependabot, now actually wired to reach
every one of them, is the ongoing review mechanism rather than a one-time
manual audit that would go stale again immediately. MinIO remains the one
deliberate exception (an exact `RELEASE.*` tag) since it doesn't publish a
rolling major-version tag the way the others do.

Decisions: none new at the ADR level — a tooling-config fix, same "not an
architectural decision" precedent as CR-076/077/078/079/080/081.

Validation: `.github/dependabot.yml` parsed with `python3 -c "import
yaml..."` — valid YAML, all 6 entries present with the expected
ecosystem/directory pairs. Cannot be proven by an actual Dependabot run
from this sandbox (same "GitHub-hosted automation, reviewed not
live-verified" category as CI changes in CR-080) — the next scheduled
Dependabot run against the real repo is what actually confirms this.

Known limitations: none new. This closes the Deployment section of
`docs/tasks.md` entirely (CR-074 through CR-082, all now checked off).

Follow-up: CR-092 (critical-journey e2e specs) and CR-083 (registration
idempotency) remain open, no fixed order decided between them.

## 2026-09-19 — CR-083 — Idempotency for register/waitlist-join (network retries)

Goal: "the DB constraint is the backstop, not the design" — a network retry
of an already-successful `POST /v1/rides/:id/register` (or the waitlist
equivalent) must not surface as an error.

Investigation: `registrations.service.ts`'s `createRegistration` already
atomically prevents a second row (`SELECT ... FOR UPDATE` row lock +
`existingActive` check + the DB-level partial unique index backstop,
CR-034/035) — that invariant was correct and untouched. The real gap was
client-facing: when a retry of the exact same (rideId, userId) register
call landed after the first one already committed, the caller got back
`409 registration_already_exists` — indistinguishable from "you tried to
double-register." `joinWaitlist` has the identical shape for its own
`existingWaiting` check (`409 waitlist_entry_already_exists`). Read
`apps/web/src/features/participant/ride-detail/components/
RegistrationButton.tsx`: its `isPending` guard only stops a second _click_
while a request is in flight — it does nothing for a genuine network-level
retry where the original request actually succeeded but the response never
reached the client, which today shows the user a generic error despite
them actually being registered. Confirmed `joinWaitlist` has two different
"already" checks that needed different treatment: `existingActive` (caller
already has an active registration — a genuine conflict, "register/cancel
instead," not a retry of the waitlist-join call) must stay a `409
registration_already_exists` error; only `existingWaiting` (the literal
same action being retried) is the idempotency case. Also confirmed
`apps/web`'s `registerForRide`/`joinRideWaitlist` clients branch on
`response.ok` (any 2xx), not the exact status code — so this fix needs zero
frontend changes and, as a side effect, fixes `RegistrationButton`'s latent
retry-shows-an-error bug for free.

Implementation: `createRegistration` and `joinWaitlist` now return
`{ registration | waitlistEntry, created: boolean }`. When the
already-exists branch is hit, the existing row is returned with
`created: false` instead of throwing — same lock, same read, different
outcome on the branch that used to error. `createRegistration`'s
`registration_confirmed` notification now only fires when `created` is
`true` (a retry must not fan out a second notification for an action that
already notified once). `registrations.routes.ts`'s two `POST` handlers
reply `201` when `created`, `200` on an idempotent replay — both added to
each route's Zod response schema. The unrelated `existingActive` check
inside `joinWaitlist` (registered-and-trying-to-join-the-waitlist-too) is
untouched, still throws `REGISTRATION_ALREADY_EXISTS()`. The now-unused
`WAITLIST_ENTRY_ALREADY_EXISTS` error factory was removed.
`docs/api.md`: documents the `200`-on-idempotent-replay behavior for both
endpoints; removed the now-impossible `409 registration_already_exists`
outcome from `POST .../register`'s own paragraph (it only ever applied to
`POST .../waitlist`'s cross-resource conflict now).

Decisions: none new at the ADR level — a behavior-only fix inside the
existing transaction/lock structure; `.claude/rules/database.md`'s
invariants are unchanged (still exactly one row per ride+user, still
enforced by the same lock + unique index).

Validation: rewrote the two tests whose asserted behavior actually changed
(`registrations.routes.test.ts`) into idempotency tests — a repeat register
call returns `200` with the _same_ registration id, `GET /v1/rides/:id`
still shows `registrationsCount: 1`, and `GET /v1/notifications/mine` shows
exactly one `registration_confirmed` entry (not two); a repeat waitlist-join
call returns `200` with the same entry id and the organizer's `GET
/v1/rides/:id/waitlist` still shows exactly one item. The two tests
covering the _unrelated_, still-an-error `existingActive`-inside-
`joinWaitlist` conflict were left unchanged and still pass. Full suite:
`pnpm turbo run lint typecheck build test --filter='!web'` — 25/25 tasks
green, 305 passed + 1 skipped (same total as before CR-083 — two tests were
rewritten in place, not added). `apps/web` untouched, no rebuild needed.

Known limitations: none new.

Follow-up: CR-092 (critical-journey e2e specs) is the one remaining open
ticket with no dependency on anything blocked in this environment.

## 2026-09-19 — CR-092 — Real critical-journey Playwright specs

Goal: write the three e2e journeys `.claude/rules/testing.md` names
(participant discovers+registers; organizer creates+publishes a ride;
organizer views participants) — `home.spec.ts` is a one-page smoke check,
not this; CR-080 only wired the suite into CI.

Implementation: new `apps/web/e2e/helpers/api-fixtures.ts`
(`registerAndVerify`/`login`/`createOrganizerProfile`/`createPublishedRide`/
`registerForRide`/`setDisplayName`, all direct `/api/v1/...` calls with the
CSRF `Origin` header a real browser fetch sends automatically but
Playwright's `APIRequestContext` does not) and new
`apps/web/e2e/critical-journeys.spec.ts` with the three journeys. Each spec
seeds only its own preconditions via API (no UI verify-email screen exists
anyway, KI-026) and drives the actually-tested journey through real UI
interaction — form fills, button clicks, rendered-state assertions — not a
second API script pretending to be a UI test. `test.describe.configure({
mode: 'serial' })` groups all three in one file: `/v1/auth/register` and
`/v1/auth/login` each carry their own 5/min/IP in-memory rate limit
(KI-014's interim tier), and the three journeys together need exactly 5 of
each — spec 3 reuses `page.request`'s already-logged-in organizer cookie
jar instead of a redundant second UI login, which is what keeps the total
at 5 instead of 6.

Two real bugs found and fixed while writing these (not pre-existing
regressions — surfaced by actually running the specs, not assumed):
`loginViaUi`'s original version clicked the login submit button and
immediately called `page.goto(...)`, racing `LoginForm`'s own
`await login(...)` — the goto's hard navigation could cancel that in-flight
fetch before the session cookie was ever set. Fixed by waiting for the
post-login `router.replace('/me')` navigation (`page.waitForURL('/me')`)
before proceeding. Also added `assertOk()` to every fixture helper — the
first version let a failed setup call (e.g. rate-limited) surface as a
confusing `Cannot read properties of undefined` several calls downstream
instead of a clear error at the actual failure point.

Decisions: none new at the ADR level — test-suite work, not an
architectural decision.

Validation: `pnpm --filter web typecheck`/`lint`: clean. `pnpm turbo run
test:e2e`: 4/4 passing (`home.spec.ts` unchanged + the 3 new journeys), run
twice to confirm no flakiness once outside the rate-limit collision window
(a single back-to-back manual rerun within the same ~60s did trip the
shared login/register limit once during development — expected given 5 of
each per run, not a bug; a single real CI run only executes the suite
once). Full `pnpm turbo run lint typecheck build test` (real local
`DATABASE_URL`): 29/29 tasks green — also cleared an unrelated stale
`apps/web/.next/types` artifact from an earlier session's production build
that was making `web#typecheck` fail on files that no longer existed; not
caused by this ticket's changes, `rm -rf apps/web/.next` was the fix (Next
regenerates it on the next `dev`/`build`/`typecheck` run).

Known limitations: none new. This was the one remaining open ticket with no
dependency on anything unavailable in this environment (Docker/Redis/S3/
2GIS all still as documented in `.claude/context/known-issues.md`).

Follow-up: none currently queued — every ticket in `docs/tasks.md` is
either checked off or explicitly blocked (CR-058 on KI-014/live Redis).

## 2026-09-19 — CR-093 — Connect live 2GIS Geocoder/Directions key (resolve KI-016)

Goal: the user supplied a real 2GIS API key ("подключи карту 2gis по api").
2GIS credentials are split into two unrelated products (CR-071):
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (public, browser map rendering) and
`MAPS_2GIS_API_KEY` (private, server-side Geocoder/Directions, billed per
request). Asked the user which product the supplied key was issued for
rather than guessing — confirmed it is the server-side Geocoder/Directions
key.

Implementation: added the key to local `.env` (`MAPS_2GIS_API_KEY`, already
`.gitignore`d — never touched `.env.example`, which stays a blank
template). Wrote a throwaway script (`packages/maps-2gis/live-check.ts`,
deleted after use, never committed) calling `create2GisMapProvider`
directly against the real 2GIS API — exactly KI-016's documented "next
action" now that a credential exists: a geocode of "Красная площадь,
Москва", a reverse-geocode, and a cycling route from Red Square to Gorky
Park.

Findings: `geocode`/`reverseGeocode`'s field-name guesses
(`point.lat`/`point.lon`, `full_name`) were exactly right — both returned
correct, sensible results immediately. `getRoute`'s `total_distance`/
`total_duration` guess was also right, but its geometry guess was wrong and
had been silently falling back to the two requested waypoints on every
call: dumped the raw routing response
(`packages/maps-2gis/raw-check.ts`/`dump.ts`, also deleted after use) and
found the real polyline lives in `maneuvers[].outcoming_path.geometry[]`,
each entry a WKT `LINESTRING(lon lat, lon lat, ...)` string — not the flat
`{lat, lon}` array `route.ts` assumed. Fixed in
`packages/maps-2gis/src/route.ts`: new `parseWktLineString` helper, rewrote
`extractGeometry` to flatten every maneuver's WKT segments instead of
looking for a top-level `geometry` field that never existed.
`provider.test.ts`'s route-geometry fixture updated to the verified real
response shape (`maneuvers[].outcoming_path.geometry[].selection`) instead
of the old invented one. Re-ran the live script after the fix and confirmed
a real multi-point road-following polyline now comes back instead of the
two-point fallback.

Decisions: none new at the ADR level — this verifies and fixes an existing
adapter (ADR-010) against its real dependency; it does not change the
architecture. No new consumer was wired in — `create2GisMapProvider` still
has zero callers in `apps/api`/`apps/web` (KI-017's "factory exists, no
consumer until one is justified" discipline stays true); that remains
follow-up work (KI-032, CR-028/CR-084), not part of this ticket's scope.

Validation: `pnpm --filter maps-2gis test` (11/11 passing),
`pnpm --filter maps-2gis typecheck`, `pnpm --filter maps-2gis lint`, and
`pnpm --filter maps-2gis... build` (maps-core/resilience/maps-2gis) all
green. Live-verified directly against the real 2GIS Geocoder and Routing
APIs (not just unit-tested against fixtures) — see Findings above.

Known limitations: `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (the separate public
browser-rendering key) still does not exist anywhere in this environment,
so KI-031 (no live MapGL rendering; every map surface shows a degraded
placeholder) is unchanged and unresolved by this ticket. `create2GisMapProvider`
still has no real caller.

Known issues resolved: KI-016 (2GIS Geocoder/Routing response parsing
unverified against a live API) — see
`.claude/context/known-issues.md`.

Follow-up: wire an actual consumer now that geocoding is live-verified —
either KI-032 (geocode-by-address UI in `EditRideForm`) or CR-028/CR-084's
route rendering. Separately, if/when a public MapGL key is provided, KI-031
becomes actionable (build the render-layer type in `packages/maps-core` +
`packages/maps-2gis`'s MapGL implementation).
