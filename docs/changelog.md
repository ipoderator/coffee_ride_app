# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~15 entries, move all but the most recent ~8 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly,
and update the pointer line below. Routine work reads only the last 3 entries of the
_live_ file (`awk` on `^## 20`, or `tail`) — the archive exists for humans and for deep
audits (grep it by CR id), not for routine agent context. (CR-202 lowered this from ~40/~15.)

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed and why, in 1-3 sentences (≤ ~600 characters).
Contract: API/types/ui contract changes, migrations — or "none".
Files: key files/dirs touched (globs, not every test file).
Validation: commands run + pass counts, one line.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

Detail beyond that (root-cause narratives, live-verification transcripts) belongs in the
commit message body or the KI entry, not here — every agent re-reads these entries.

---

Entries before CR-205 (CR-000 through CR-204, 2026-09-09..2026-10-03) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213),
per this section's own rule.

## 2026-10-03 — CR-205 — Security audit fixes

Summary: whole-app audit against `security.md` (no CRITICAL/HIGH). Fixed: the GPX download's `Content-Disposition` took the raw uploaded name — a Cyrillic name was a 500, a `"` added parameters; now an ASCII fallback + RFC 5987 `filename*`. Web pages got their own security headers (none before; helmet covers only the API). Verify-email/reset-password tokens are claimed by a checked guarded UPDATE — concurrent resets with one token all succeeded. fastify 5.12.5 + in-range transitive bumps; Dependabot alerts enabled on GitHub.
Contract: `GET /v1/rides/:id/route/download`'s `Content-Disposition` now carries `filename*`; no other API/types change.
Files: `apps/api/src/lib/content-disposition{,.test}.ts` (new), `apps/api/src/modules/rides/{rides.routes,route.routes.test}.ts`, `apps/api/src/modules/auth/{auth.service,auth.routes.test}.ts`, `apps/web/next.config.ts`, `apps/web/e2e/security-headers.spec.ts` (new), `apps/api/package.json`, `pnpm-lock.yaml`, `.claude/rules/{security,do-not-break}.md`.
Validation: api vitest 599 passed/8 skipped (the reset race test fails on the old code: 4×200); api+web typecheck/lint clean; e2e security-headers + home/critical-journeys/gpx-route/password-reset 13/13; `pnpm audit --prod` 16 → 4.
Decisions: no script/style CSP on pages (Next inline scripts, 2GIS MapGL unverified); `/register`'s 409 (account existence) kept — rate-limited, a UX trade-off.
Follow-up: KI-090 — the 4 remaining advisories are Next 15's pinned postcss 8.4.31 (build-time only); fixed by the Next 16 upgrade (Dependabot #22).

## 2026-10-04 — CR-206 — ponytail-audit low-risk cleanups

Summary: installed the `ponytail` plugin globally and ran its whole-repo over-engineering audit. Applied only the findings that cannot change behavior: `class-variance-authority` (declared in `apps/web`, zero references repo-wide) and `clsx`/`tailwind-merge` dropped from `apps/web` (the only `cn()` lives in `packages/ui`, which declares both itself; `apps/web/src/lib/utils.ts` just re-exports it). `formatPriceParts` inlined into `formatPrice` — the one `*Parts` helper of ten with no caller outside `format.ts`.
Contract: none. No API, types, DB or user-visible string change.
Files: `apps/web/package.json`, `packages/ui/src/{format,format.test}.ts`, `pnpm-lock.yaml`.
Validation: ui vitest 245 passed, web unit 772 passed, storybook 196 passed (render+play+axe); typecheck/lint/format clean; `pnpm build` 7/7; built API smoke-tested live — `/health` 200 with `db: ok`.
Decisions: `postgres` stays a direct `apps/api` dependency — removed it first, then restored it: `scripts/build.mjs` documents that esbuild inlines `packages/db`'s source, so the bundle itself requires `postgres`, and pnpm only symlinks a package's own declared deps. `pnpm build` passes either way; only the `node dist/server.js` smoke test catches it. `apps/web/src/lib/utils.ts` kept despite 0 importers — `components.json`'s `aliases.utils` points at it, so removing it would break `shadcn add`.
Follow-up: the audit's `uploadRoute`/`replaceRoute` (~25 shared lines) and `uploadCoverImage`/`replaceCoverImage` (~40) duplication is left as-is — a logic change in the upload paths, not a low-risk cleanup. `apps/web/coverage/` is committed to the tree; check `.gitignore` if unintended.

## 2026-10-04 — CR-207 — Toast timers cleared on unmount (CI red with every test passing)

Summary: `ci` was failing on `web#test:coverage` while all 772 tests passed — Vitest exited 1 on an unhandled `ReferenceError: window is not defined`. `ToastProvider` scheduled two bare `setTimeout`s per toast and never cleared them, so a toast shown shortly before unmount fired `setToasts` after jsdom was torn down (and, in the browser, updated an unmounted component). Timers are now tracked in a ref and cleared on unmount; `schedule()` also drops a fired id so a long-lived provider doesn't accumulate them. Timing-dependent, so CI-only: the same error already failed run 37149360054 (`e9e0ee8`) before CR-206.
Contract: none.
Files: `packages/ui/src/components/Toast{,.test}.tsx`.
Validation: ui 246 passed (the new test fails on the old code — `expected 1 to be +0`), web coverage 772 passed with no `Errors` line, storybook 196 passed; typecheck 8/8, lint 9/9, format clean. `packages/ui` coverage 99.58 % statements vs the 99.57 % floor — no baseline update.
Decisions: fixed in `ToastProvider` rather than by making the test unmount-safe — the leak was real at runtime too, not a test artifact.
Follow-up: full `pnpm coverage:check` not run (needs live Postgres/Redis/S3; Docker was down). `gh run watch --exit-status` exited 0 on a failed run — check `gh run view --json conclusion` instead. The red Dependabot runs (zod, next, lucide-react, tailwind-merge) share this cause and should clear.

## 2026-10-04 — CR-209 — auth coverage gate reddened `ci` on commits that changed no code

Summary: `main` failed the coverage gate at `463a86b`, a markdown-only commit, with the auth scope at 95.16/94.74/80.30 against a 95.59/95.06/80.64 floor — the same numbers four Dependabot PRs showed. CR-208 read that as a `push` vs `pull_request` difference; wrong — the push run fails identically. The real cause: CR-205's two single-use-token tests race four real requests at one token, and a loser can be rejected by the pre-check `usedAt` _or_ by the guarded UPDATE inside the transaction. Both satisfy the assertion, so when timing sent every loser down the pre-check, `auth.service.ts:212` went uncovered. Added one deterministic test per guard that claims the token between the pre-check and the transaction, so only the in-transaction branch can reject.
Contract: none — tests only, no production code changed.
Files: `apps/api/src/modules/auth/auth.routes.test.ts`.
Validation: full local stack (postgres/redis/s3 + `RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`). `pnpm test:coverage` 606 passed/3 skipped, 6/6 tasks; `pnpm coverage:check` holds at or above baseline, auth branches **81.82 (+1.18)**; typecheck 8/8, lint 9/9, Prettier clean. Both tests mutation-checked: wrapping either guard in `if (false && …)` makes its test fail.
Decisions: fixed the tests, not the baseline — lowering the floor would have hidden an untested race branch in single-use token handling. The old concurrency tests stay: they assert the end-to-end "exactly one winner" invariant the deterministic pair does not.
Follow-up: e2e `login-return.spec.ts:67` («Email подтверждён» heading absent) failed through both CI retries on PR #2; `main`'s run died on the coverage gate before reaching e2e, so it is unknown whether this is a `main` problem — recheck once `main` is green. CR-208 (Dependabot) resumes then; `ip-address@10.7.3`'s quarantine expires 2026-10-05 ~10:35Z.

## 2026-10-05 — CR-210 — pre-launch configuration readiness: preflight warnings, first-deploy checklist, ADR-030

Summary: the owner's pre-launch blocker list was four external actions (2GIS commercial key, Unisender sender, host/DNS) plus one undecided vendor. Made the repository turn each into "set the value and it works", loudly. New `apps/api/src/preflight.ts` is a warning tier below `loadEnv()`'s boot-refusal: configuration that parses and boots in a supported degraded mode but leaves a feature dead in production. The case it exists for is `UNISENDER_API_KEY` set with `EMAIL_FROM_ADDRESS` empty — `plugins/email.ts`'s pair gate absorbs it into `emailProvider = null`, so verification and password reset are silent dead ends (KI-026, KI-042). Surfaced as `pnpm preflight [--env <path>]` and logged at `api` boot.
Contract: none — no endpoint, type or schema change. `MAPS_2GIS_API_KEY` now preprocesses `''` → `undefined` like `REDIS_URL`/`S3_ENDPOINT` (KI-046's fix, missed for this one field; `plugins/maps.ts`'s truthiness check meant no behavior change).
Files: new `apps/api/src/preflight.ts`, `apps/api/src/preflight.test.ts`, `apps/api/scripts/preflight.ts`, `apps/api/tsconfig.scripts.json`, `deploy/FIRST-DEPLOY.md`; edited `apps/api/src/{env,server}.ts`, `apps/api/package.json`, `package.json`, `eslint.config.mjs`, `.env.example`, `docs/{decisions,deployment}.md`.
Validation: full live stack (`set -a && source .env`, postgres/redis/s3, `RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`). api 612 passed/8 skipped; `pnpm test:coverage` 6/6; `pnpm coverage:check` holds at or above baseline (auth branches 81.82 +1.18); typecheck 8/8 — `apps/api` now runs two passes, the second covering `scripts/`, verified to actually fail on an injected type error; lint 9/9, `lint:root` and Prettier clean. `pnpm preflight` exercised against the repo `.env` (ERROR tier, exit 1) and a realistic production file (2 warnings, exit 0).
Decisions: ADR-030 — ship with structured stdout plus the existing webhook seam, no error-tracking vendor; the host owns log retention. Warnings exit 0 deliberately: a check that fails on an accepted degraded mode trains operators to ignore it. `scripts/` got its own tsconfig rather than being left outside `tsc` — a type error in an operator script would otherwise surface during a deploy.
Follow-up: KI-075's 403 still maps to `unavailable` → 503 "route builder unavailable"; a commercial key changes the 50 km limit, not the mapping, so quota/licence refusals will keep reading as "сервис недоступен" — needs its own CR (owner declined it in this task's scope). KI-045's Caddy/ACME and `backup` items remain unexecuted until a real host. KI-006 was already resolved (CR-079) and archived — the owner's list reporting it as open was inaccurate; only the vendor question was open, and ADR-030 closes it.

## 2026-10-05 — CR-211 — `/verify-email` sent its single-use token twice under React Strict Mode

Summary: e2e `login-return.spec.ts:67` failed on `main` through all three CI retries (run `37310104645`, pushed as CR-210 — an API-only commit that touched no `apps/web`, auth or e2e file, so it was a pre-existing `main` failure, not a regression from it). The page rendered «Ссылка недействительна или уже была использована» over a verification that had in fact succeeded. Cause: `VerifyEmailStatus` called `POST /v1/auth/verify-email` from a `useEffect`, and e2e serves the web app with `pnpm dev`, so React Strict Mode's dev-only double-invoke sent the same single-use token twice — the first call verified the address, the second legitimately answered `verification_token_already_used`, and that error won the render. The existing `cancelled` flag cannot prevent this: it gates `setState`, not the already-dispatched request. Reproduced directly against the local API (call 1 → 200, call 2 → 400 `verification_token_already_used`). This answers CR-209's open follow-up, which could not tell whether the failure was `main`'s.
Contract: none. The API is correct and unchanged — the guarded `UPDATE … WHERE used_at IS NULL` single-use claim (CR-205, `.claude/rules/do-not-break.md`) behaved exactly as specified; the bug was the client racing itself. Same class as CR-101's `containerGeneration` guard in `packages/maps-2gis/src/render.ts`.
Files: `apps/web/src/features/auth/verify-email/components/VerifyEmailStatus.tsx`, `apps/web/src/features/auth/verify-email/verify-email.test.tsx`.
Validation: web unit 774 passed (68 files); `test:storybook` 196 passed (render + play + axe WCAG 2.1 AA); `login-return.spec.ts` 3/3 locally, having failed every CI retry; full e2e 60 passed; typecheck 8/8, lint 9/9, Prettier clean. CI run `37314070977` green end to end (E2E + docker-smoke). Both new tests mutation-checked — restoring the unguarded call fails the first.
Decisions: cached the in-flight promise per token in a ref rather than adding a plain re-entry guard. A bare "don't run twice" check leaves the second effect run with nothing to await — its predecessor's cleanup has already set `cancelled` — so the screen sits on the skeleton forever; that was observed while developing this fix, which is why the ref holds the promise and every re-run subscribes to the same result.
Follow-up: the 12 visual-regression specs generate `*-darwin.png` baselines on a macOS run and "fail" on first invocation; those are local artifacts and were deleted, never committed (`.claude/rules/testing.md` — CI compares `-linux.png`). CR-208 (Dependabot) is now unblocked: `main` is green.

## 2026-10-06 — CR-212 — Next 16: `apps/web` stays on webpack, eslint-config-next goes flat

Summary: Dependabot PR #22 (Next 15.5.25 → 16.3.8) was the one red check left on the repo; `next build` failed because 16 makes Turbopack the default bundler and refuses to start with a `webpack` config present. Upgraded on the terms the codebase actually allows. Turbopack cannot replace the one thing that `webpack` block does — `extensionAlias` mapping `.js` → `.ts/.tsx` for `packages/types`' NodeNext-style imports (KI-017): Turbopack has no equivalent (vercel/next.js#82945, open since 2025-08), and `resolveExtensions` is not one, verified by building against it (144 `Can't resolve './api/*.js'` errors from `packages/types` alone). So `dev`/`build` now pass `--webpack` explicitly; webpack remains a supported opt-out in 16 with no announced removal. The second, unrelated blocker was ESLint: eslint-config-next 16 ships prebuilt flat configs and dropped `./package.json` from its `exports`, so the FlatCompat bridge both failed to resolve and then threw `Converting circular structure to JSON` — its subpaths are now imported directly, which also retires CR-191's `resolvePluginsRelativeTo` hoisting workaround.
Contract: none — no endpoint, type or schema change. `apps/web/next-env.d.ts` is regenerated by Next 16 in a new shape (`import` instead of a triple-slash `path` reference, plus `root-params.d.ts`) and with double quotes, so it is now in `.prettierignore`: formatting it would be undone by the next build and redden `format:check`.
Files: `apps/web/package.json` (`next`, `eslint-config-next`, `--webpack` in `dev`/`build`), `apps/web/next.config.ts` (why webpack stays), `apps/web/eslint.config.mjs` (direct flat imports, FlatCompat removed), `apps/web/next-env.d.ts`, `.prettierignore`, `pnpm-lock.yaml`.
Validation: developed in a throwaway git worktree, then ported and re-validated in the main tree. `pnpm --filter web build` 19/19 pages; typecheck 8/8; lint 9/9 + `lint:root`; Prettier clean; web unit 774 passed (68 files); `test:storybook` 196 passed (render + play + axe); full e2e 60 passed; api 615 passed/5 skipped on the live stack (`RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`) — unaffected, as expected.
Decisions: `react-hooks/set-state-in-effect` (new in 16, from React Compiler's rules) reports 28 violations across 26 files — the app-wide "fetch in an effect, setStatus" pattern. Set to `warn` rather than fixed here or silenced per file: the violations are real, but reworking every data-loading effect is its own task (KI-092), not part of a dependency bump, and `warn` keeps all 28 visible in every lint run. `eslint-config-next` was bumped alongside `next`, which Dependabot's PR did not do — left at 15 it crashes ESLint outright under 16.
Follow-up (added after the first CI run on this commit, `37417815496`): the upgrade also needed `images.localPatterns`. Next 16 turns a local `next/image` `src` carrying a query string into an _error_ where 15 only warned, which the local gate never caught — `next build` does not evaluate it and the warning had been in the unit-test output all along. It broke the cover-upload and ride-publish e2e specs on CI. The three upload forms append `?v=${Date.now()}` to bust the browser cache after a replace, so `localPatterns` now allows any query under `/api/v1/**` (ADR-019: the bucket is private, images are only served through that proxy path). `search` is omitted rather than set, because Next only compares it when defined and accepts no wildcard — a literal cannot match `Date.now()`.
Follow-up (second CI run, `37419608399`): `localPatterns` fixed the hard error but exposed the next one — Next 16's image optimizer fetches the source itself, server-side and without the viewer's session cookie, so a private cover (ADR-019: served only through the authenticated `/api/v1/...` proxy) came back as a non-image and Next failed the render with "The requested resource isn't a valid image … received null". In 15 that same fetch only warned. Both cover `<Image>`s (`RideDetailView`, `CoverImageUploadForm`) are now `unoptimized`: nothing is lost, since the API already returns a processed, size-bounded image (`lib/image-processing.ts`), and `packages/ui`'s `Avatar` was never affected (plain `<img>`, CR-097). `cover-image.test.tsx`'s KI-085 assertion now matches a plain `?v=` instead of the optimizer's URL-encoded `v%3D` — same cache-bust, different encoding; mutation-checked by removing the cache-bust, which fails it.
Follow-up: KI-092 — do the refactor, then raise the rule back to `error`. KI-090 partially resolves: postcss 8.4.31 → 8.5.23 clears three of its four advisories; one high remains, now from `source-map-js@1.2.1` pinned inside Next's own tree (needs ≥1.2.2), so that entry stays open. PR #22 itself should be closed in favour of this commit — its `package.json` change is a subset and would reintroduce the ESLint break.
Follow-up (third CI run, `37421468828`, and every Dependabot rebase since `ae3b13f`): `critical-journeys.spec.ts`'s organizer journey failed every retry on the cabinet skeleton («Загрузка личного кабинета…»), each attempt at a different step. Not the session: the retry's trace shows `[Fast Refresh] rebuilding` ×3 and then a fresh document (`[HMR] connected`) mid-wizard — e2e serves `next dev`, which compiles each route on its first request, and under Next 16 (webpack) that compile ends in a full page reload while a browser is on the page. A warm local `.next` hid it; a cold worktree showed the same reload locally, just before the first click. Fix: `e2e/warmup.setup.ts` (Playwright `globalSetup`) requests every `src/app` route before any browser connects, and `next.config.ts`'s `onDemandEntries` keeps the compiled pages for the run instead of disposing them after 60 s. An uncommitted `SessionProvider` promise-cache "fix" from the previous session was not the cause and is not part of this. Files: `apps/web/e2e/warmup.setup.ts`, `apps/web/playwright.config.ts`, `apps/web/next.config.ts`. Validation: cold-`.next` worktree, `CI=1` full e2e — 48 passed, the 12 failures all local-only visual cases (missing `*-darwin.png`, the dev DB's ~212 rides); traces show no rebuild/reload outside the specs' own `page.reload()`; web lint 0 errors (28 KI-092 warnings), typecheck, Prettier clean.
Follow-up: CI run `37425849763` on `941c555` green end to end — e2e 60 passed, none flaky, docker-smoke green. CR-212 closed.

## 2026-10-06 — CR-213 — SessionProvider regression test; security audit run 1 closed out

Summary: CR-212's uncommitted `SessionProvider` change (caching `getCurrentUser()` per attempt) was dropped. A new test (`session-context.test.tsx`) shows the original provider resolves under Strict Mode even when the effect re-runs before a slow response lands; `/me` is idempotent, so the extra dev request is harmless. The cabinet-skeleton CI failure was the Next 16 route reload, fixed by `e2e/warmup.setup.ts`. The test stays as regression coverage. The 2026-10-04 security audit was finished by source reading only (owner: no sub-agents; this host has no sandbox, so the run is marked `incomplete`). No confirmed vulnerability; 4 needs-validation leads (KI-093); 9 claims rejected; stale cover/avatar caching found (KI-094). Artifacts: `~/security-audit-skill/coffeeride/run-1/`. The stale `next16-handoff.md` and `security-audit-handoff.md` were removed.
Contract: none.
Files: `apps/web/src/lib/auth/session-context.test.tsx`, `.claude/context/known-issues.md`, `.claude/context/project-state.md`.
Validation: new test 2/2 (also green against the unchanged provider, which is the point); eslint, Prettier, `tsc --noEmit` for web clean; both audit validators PASS (13 findings, 15 ledger units).

## 2026-10-07 — CR-214 — Shield scan: dependency vulnerabilities and supply-chain hardening

Summary: A Shield `quick` scan (Semgrep, gitleaks, `pnpm audit`) found 3 high and 1 moderate advisory, plus supply-chain gaps. `sharp` 0.35.5 fixes a librsvg CVE that uploads could reach, because `processImage` let sharp decode any format before the allowlist ran. A JPEG/PNG/WebP signature check now runs before any decoder. `source-map-js` is 1.2.2 (KI-090 closed), esbuild-kit's esbuild is ^0.25.4 and `lint-staged` is 17. Actions are pinned by SHA, Dependabot has a 7-day cooldown, pnpm has a 7-day `minimumReleaseAge`, `blockExoticSubdeps` and `trustPolicy`. `braces` has no fix (KI-095). Semgrep's 18k custom-rule hits were false positives.
Contract: none (an upload with a non-JPEG/PNG/WebP signature already got `ImageInvalidError`; now it does before decoding).
Files: `apps/api/src/lib/image-processing.ts` (+ test), `apps/api/package.json`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/{ci,load-test,maps-contract}.yml`, `.github/dependabot.yml`, `.claude/rules/do-not-break.md`, context/KI files.
Validation: api vitest 615 passed / 8 skipped (the new no-decoder test fails without the gate); `turbo typecheck lint` 17/17; api build; Prettier on touched files; `drizzle-kit check`/`generate` with the overridden esbuild; `lint-staged --diff` over the last 5 commits; `pnpm install --frozen-lockfile`; from-scratch resolution under the new policies in a scratch copy; `pnpm audit` = 1 high (`braces`, KI-095).
Decisions: pin each action to the SHA its `v4` tag used today (pnpm/action-setup v4.3.0, not v4.4.0) so CI behaviour doesn't change; Dependabot's `github-actions` entry keeps the SHAs current. `trustPolicyExclude` names two exact old versions (`eslint-import-resolver-typescript@3.10.1`, `semver@6.3.1`) that predate provenance. `braces` is not silenced with `ignoreGhsas`.
Follow-up: a fresh full re-resolution fails until `eslint-config-next`/`next` 16.3.8 is a week old (≈2026-10-13) — `minimumReleaseAgeExclude` if one is needed sooner. Drop the esbuild override once drizzle-kit leaves esbuild-kit. Shield v0.3.1's `mktemp …XXXXXX.json` collides on macOS when scans run in parallel.

## 2026-10-07 — CR-215 — Drop pnpm `minimumReleaseAge` (broke Dependabot); restore `lib/` coverage

Summary: Right after CR-214, three "Dependabot Updates" npm jobs (lucide-react, tailwind-merge, zod) failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`: Dependabot's pnpm updater re-resolves the whole tree, and the locked `next`/`eslint-config-next` 16.3.8 were 6 days old. Security updates skip `cooldown` by design, so they would always propose a version younger than the window and always fail. The setting is removed; Dependabot's 7-day `cooldown` stays as the release-age delay. `blockExoticSubdeps` and `trustPolicy` stay. This corrects CR-214's entry, which listed `minimumReleaseAge` as kept. CR-214 also failed `ci`'s coverage gate (`apps/api/src/lib/` lines 94.48% < 94.77%): the signature gate made the post-decode allowlist throw unreachable by ordinary files. That branch stays (the decode decides, `do-not-break.md`); a test now feeds a passing signature that decodes as another format.
Contract: none.
Files: `pnpm-workspace.yaml`, `.github/dependabot.yml` (comment), `apps/api/src/lib/image-processing.test.ts`, `.claude/rules/do-not-break.md`, context files.
Validation: a scratch copy with the lockfile reproduces the failure on `pnpm --filter web update lucide-react@latest --lockfile-only` with the setting and passes without it; `pnpm install --frozen-lockfile`; image-processing tests 10/10 with `image-processing.ts` at 100% lines/statements; api tsc/eslint; Prettier.
Decisions: no `minimumReleaseAge` while Dependabot manages npm updates — recorded in `do-not-break.md`.
Follow-up: watch the next scheduled Dependabot npm run and this push's `ci` go green. Lesson: CR-214 never ran `coverage:check` locally — needs the live stack (S3/Redis flags), so CI was the first measurement.

## 2026-10-07 — CR-216 — No Dependabot `cooldown` for npm

Summary: After CR-215 the npm "Dependabot Updates" job still failed with the same `ERR_PNPM_NO_MATURE_MATCHING_VERSION` (`eslint-config-next` 16.3.8, 6 days old). The job log shows why: for pnpm, Dependabot implements `cooldown` as `pnpm update <dep> --lockfile-only --no-save -r --config.minimum-release-age=10080`, which re-checks the whole lockfile. With npm cooldown on, any manual or security bump younger than the window fails every npm job. The owner chose to drop `cooldown` from the npm entry only; actions/docker/docker-compose keep 7 days.
Contract: none.
Files: `.github/dependabot.yml`, `pnpm-workspace.yaml` (comment), `.claude/rules/do-not-break.md`, context files.
Validation: Dependabot's exact command in a scratch copy with the lockfile — with `--config.minimum-release-age=10080`: `ERR_PNPM_NO_MATURE_MATCHING_VERSION` on `@next/swc-*` 16.3.8; without it: resolves. Prettier.
Decisions: npm gets no release-age delay while Dependabot + pnpm behave this way. CR-215 had assumed `cooldown` was independent of pnpm's setting; it isn't.
Follow-up: confirm this push's Dependabot npm run is green. Revisit if Dependabot starts scoping the age check to the updated dependency.
