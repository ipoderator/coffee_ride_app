# Current task — CR-214: fix the Shield scan's vulnerabilities

Source: owner, 2026-10-07 — "нужно исправить все уязвимости" after a Shield (`quick`
mode: Semgrep + gitleaks + `pnpm audit` + outdated) scan run from the session scratchpad.

## Goal

Clear every real finding of the scan; the Semgrep custom-rule hits (`$WHERE`
metavariable, `setTimeout` as eval, keyed writes as prototype pollution, `Math.random`
jitter) were triaged as false positives and need no code change.

## Requirements / acceptance criteria

1. `sharp` ≥ 0.35.5 in `apps/api` (GHSA-wq5f-xc86-pv6w, librsvg — reachable: an upload
   is decoded by `sharp(buffer).metadata()` before the format allow-list).
2. `source-map-js` ≥ 1.2.2 everywhere (GHSA-68fv-2mgg-jv7q) — lockfile refresh within
   the existing `^` ranges, no override of Next's tree (KI-090).
3. `esbuild` ≤ 0.24.2 gone (GHSA-67mh-4wv8-2f99, via `drizzle-kit >
@esbuild-kit/core-utils`) — `drizzle-kit` still works.
4. `braces` (GHSA-vfj7-8cjw-p6xm, no patched release exists): drop every path that can
   be dropped (`lint-staged` 17 uses picomatch); document what remains.
5. Supply-chain hardening flagged by Semgrep: actions pinned to commit SHAs, Dependabot
   `cooldown`, pnpm `minimumReleaseAge` / `blockExoticSubdeps` / `trustPolicy`.
6. `pnpm audit` shows nothing except the documented `braces` remainder; install,
   typecheck, lint, api tests, lint-staged hook work.

## Planned files

`apps/api/package.json`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
`.github/workflows/*.yml`, `.github/dependabot.yml`, context/docs.

## Progress

- [ ] 1 sharp - [ ] 2 source-map-js - [ ] 3 esbuild - [ ] 4 braces/lint-staged
- [ ] 5 supply chain - [ ] 6 validation - [ ] close-task

## Validation results

api vitest 615 passed / 8 skipped (new no-decoder test fails without the gate);
`turbo typecheck lint` 17/17; api build; Prettier; `drizzle-kit check`/`generate`;
`lint-staged --diff=HEAD~5...HEAD`; frozen install; from-scratch resolution under the
policies (scratch copy); `pnpm audit`: 1 high (`braces`, KI-095).

## Discovered issues

- Shield v0.3.1 on macOS: `mktemp /tmp/shield-*-XXXXXX.json` (BSD mktemp does not
  randomize before a suffix) collides when scans run in parallel.

## Final result

Done except `braces` (no patched release exists — KI-095). A from-scratch
re-resolution fails until next/eslint-config-next 16.3.8 is 7 days old (~2026-10-13);
frozen/incremental installs are unaffected.
