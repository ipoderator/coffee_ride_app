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

- [x] CR-216 Dependabot `cooldown` removed from the npm entry — Dependabot runs
      pnpm with `--config.minimum-release-age` for it (same failure as CR-215) —
      done 2026-10-07. See docs/changelog.md
- [x] CR-215 pnpm `minimumReleaseAge` removed — Dependabot's updater re-resolves
      the whole tree and failed every npm job on a 6-day-old `next` — done
      2026-10-07. See docs/changelog.md
- [x] CR-214 Shield scan fixes: `sharp` 0.35.5 + upload signature gate,
      `source-map-js` 1.2.2 (KI-090 closed), esbuild-kit's esbuild ^0.25.4,
      `lint-staged` 17; actions pinned by SHA, Dependabot cooldown, pnpm
      release-age/trust policies; `braces` unfixable upstream (KI-095) — done
      2026-10-07. See docs/changelog.md
- [x] CR-213 SessionProvider regression test (CR-212's candidate fix dropped — not
      the cause); security audit run 1 closed out, no confirmed vulnerability
      (KI-093 leads, KI-094 stale cover/avatar cache)
- [x] CR-212 Next 16.3.8: `apps/web` pinned to `--webpack` (Turbopack has no
      `extensionAlias` for `packages/types`' `.js` imports), eslint-config-next
      imported as flat config, `set-state-in-effect` parked at `warn` (KI-092)
      — done 2026-10-06; e2e route warm-up for Next 16's dev reloads, CI green
      at `941c555`. See docs/changelog.md
- [x] CR-211 `/verify-email` sends its single-use token exactly once — React Strict
      Mode's double-invoke burned the link and showed «Ссылка недействительна» over a
      successful verification, failing e2e `login-return.spec.ts` on `main`
      — done 2026-10-05. See docs/changelog.md
- [x] CR-210 pre-launch configuration readiness: `pnpm preflight` warns on
      configuration that boots but leaves a feature dead (empty
      `EMAIL_FROM_ADDRESS` above all), `deploy/FIRST-DEPLOY.md`, ADR-030 on
      error tracking — done 2026-10-05. See docs/changelog.md
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
