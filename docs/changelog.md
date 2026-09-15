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
