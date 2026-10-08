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

- [x] CR-219 First production deploy: coffeeride.site live on the VPS
      (`/opt/deployments/coffee-ride`), Let's Encrypt via Caddy, `www.` → 301 —
      done 2026-10-08. See docs/changelog.md
- [x] CR-218 Single-VPS deploy readiness (ADR-031): `docker-compose.infra.yml`
      overlay (Postgres/Redis/SeaweedFS), `deploy/deploy.sh`,
      `deploy/production.env.example`, email env passed to `api`, log rotation;
      Docker smoke on the overlay incl. backup → restore — done 2026-10-07.
      See docs/changelog.md
- [x] CR-217 Security-review fixes: token jobs `removeOnFail`, unawaited reset
      email without a queue, `__Host-session`, image pixel cap, versioned
      cover/avatar URLs (KI-094, KI-093 closed), stored route geometry capped at
      5,000 points — done 2026-10-07. See docs/changelog.md
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
