# Backlog

Persistent task list. `.claude/context/current-task.md` is the active task;
`.claude/context/project-state.md` → "Next" holds the prioritised next steps.

Every completed section as of CR-201 (CR-001..CR-201: foundation, auth, rides, route,
registration, communication, post-ride, quality, resilience, extensibility, security,
deployment, contract follow-ups) lives verbatim in `docs/tasks-archive.md` — grep it
by CR id, don't read it whole (the "Recently done" items below are in it too).

Rules: add an item as `- [ ] CR-XXX short goal` under "Open" when work is agreed;
on completion check it off and move it to "Recently done" with one line
(`— done YYYY-MM-DD. See docs/changelog.md`). Keep "Recently done" to ~8 items —
older ones go to the bottom of `docs/tasks-archive.md`.

## Open

None — see `project-state.md` → "Next" for candidate work awaiting the owner.

## Recently done

- [x] CR-212 Next 16.3.8: `apps/web` pinned to `--webpack` (Turbopack has no
      `extensionAlias` for `packages/types`' `.js` imports), eslint-config-next
      imported as flat config, `set-state-in-effect` parked at `warn` (KI-092)
      — done 2026-10-06. See docs/changelog.md
- [x] CR-211 `/verify-email` sends its single-use token exactly once — React Strict
      Mode's double-invoke burned the link and showed «Ссылка недействительна» over a
      successful verification, failing e2e `login-return.spec.ts` on `main`
      — done 2026-10-05. See docs/changelog.md
- [x] CR-210 pre-launch configuration readiness: `pnpm preflight` warns on
      configuration that boots but leaves a feature dead (empty
      `EMAIL_FROM_ADDRESS` above all), `deploy/FIRST-DEPLOY.md`, ADR-030 on
      error tracking — done 2026-10-05. See docs/changelog.md
- [x] CR-200 KI-087: avatar/cover/GPX/stop/route-point deletes ask in `ConfirmDialog`,
      not `window.confirm`; KI-082's misfiled status corrected; KI-088's baseline
      captured from CI (temporary draft PR) — done 2026-10-03. See `docs/changelog.md`.
- [x] CR-203 `project-state.md` cut to a ~100-line snapshot; old text verbatim in
      `project-state-archive.md`, invariants in `do-not-break.md`. See
      `docs/changelog.md`.
- [x] CR-204 `do-not-break.md` as a path-scoped rule loaded whole; area history via
      changelog grep in the read protocol. See `docs/changelog.md`.
- [x] CR-205 Security audit fixes: GPX download `Content-Disposition` (Cyrillic name
      was a 500), web page security headers, single-use token race, fastify and
      transitive bumps, Dependabot alerts on. KI-090 opened. See `docs/changelog.md`.
- [x] CR-206 `ponytail` plugin installed globally; its whole-repo audit applied where
      risk-free: `class-variance-authority`/`clsx`/`tailwind-merge` dropped from
      `apps/web`, `formatPriceParts` inlined. `postgres` deliberately kept in
      `apps/api` (bundle requires it — see `scripts/build.mjs`). Upload/replace
      duplication left for a separate task. See `docs/changelog.md`.
- [x] CR-207 `ToastProvider` clears its pending auto-dismiss/exit timers on unmount —
      an uncleared timer fired `setToasts` after jsdom teardown, failing `ci` with
      every test passing (and updating an unmounted component in the browser).
      Predates CR-206. See `docs/changelog.md`.
- [ ] CR-208 Dependabot triage — 13 open PRs classified; majors declined (KI-091),
      Next 16 is its own task (KI-090). Paused behind CR-209's red `ci`; the npm
      bumps also wait on `ip-address@10.7.3`'s quarantine (expires 2026-10-05
      ~10:35Z). See `.claude/context/current-task.md`.
- [x] CR-209 Deterministic tests for both single-use-token guarded UPDATEs — the
      coverage gate failed on `main` at a markdown-only commit because CR-205's
      concurrency races covered the in-transaction branch only by chance.
      See `docs/changelog.md`.
