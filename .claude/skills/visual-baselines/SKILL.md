---
name: visual-baselines
description: Use when Playwright `toHaveScreenshot` baselines must be created or refreshed — a UI change moved a screenshotted screen, CI fails on `*-chromium-linux.png`/`*-mobile-linux.png`, a KI says a baseline is stale, or the user says "обнови эталоны", "перегенерируй скриншоты", "update snapshots". Generates x86_64 Linux baselines (Docker amd64 or the CI artifact), never native macOS ones.
---

# Visual baselines

Read first: `.claude/rules/testing.md` → "Visual regression and adaptive checks".
Baselines live in `apps/web/e2e/*.spec.ts-snapshots/` and must match CI's
`ubuntu-latest` x86_64 runner. A native macOS run produces `-darwin` files that are
never committed (delete them if they appear).

## Decide first

- Which screenshots does the change legitimately move? List them (spec + test name).
  Only those get new baselines; any other diff is a regression to fix, not to accept.
- Is Docker running? `docker info` — if not, `open -a Docker` and poll `docker info`
  for up to ~90 s. Still down → go straight to path B.

## Path A — Docker amd64 (preferred)

1. Version: `@playwright/test` in `apps/web/package.json` (resolve the installed one:
   `pnpm --filter web exec playwright --version`).
2. Pull **in the background** (`run_in_background`), image
   `mcr.microsoft.com/playwright:v<version>-jammy` with `--platform linux/amd64`.
   Check progress with Monitor/occasional reads; stop it (TaskStop) after ~10 min
   without progress. Do not retry the pull in a loop — switch to path B.
3. Run only the affected specs:
   ```
   docker run --rm --platform linux/amd64 -v "$PWD":/work -w /work/apps/web \
     mcr.microsoft.com/playwright:v<version>-jammy \
     npx playwright test <spec files> --update-snapshots
   ```
   The specs need the API + DB the way CI has them; if the container can't reach
   them, use path B rather than improvising networking.

## Path B — CI artifact

1. Push the change (via `commit-push`); let the `ci` job fail on screenshots.
2. `gh run list --branch <branch> -L 3`, then
   `gh run download <run-id> -n playwright-report -D <scratchpad>/pw-report`.
3. For **every** `*-diff.png`: Read the image. Accept only the intended change or
   anti-aliasing. A layout shift, missing element, skeleton instead of content or a
   wrong theme is a test/app bug — fix it instead.
4. Copy each accepted `*-actual.png` over the matching baseline name in
   `e2e/<spec>.spec.ts-snapshots/` (`<name>-chromium-linux.png` / `-mobile-linux.png`).

## Finish

- `git status apps/web/e2e` — only the intended PNGs changed, no `-darwin` files.
- Commit as `test: <CR/KI> refresh <screen> visual baseline` (separately from code
  is fine), push, confirm the next `ci` run is green on screenshots.
- If baselines are still pending at the end of the run, say so under "Found" and
  keep/open the KI (`known-issue` skill).
