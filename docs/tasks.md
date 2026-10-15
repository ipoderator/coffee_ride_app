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

- [x] CR-269 full `/terms`, `/privacy`, new `/personal-data-consent` (versioned, with
      history); two separate unticked consents on `/register`; consent step before a
      first Google/Yandex account; re-consent on `/legal-update`; audit trail
      `legal_acceptances` (ADR-041) — done 2026-10-15 on `experiments`, ported to
      `feat/legal-consents`. Owner inputs + lawyer review pending. See docs/changelog.md
- [x] CR-268 final check of the auth mockup work (CR-260..CR-265): the whole flow in
      Chromium with fake Google/Yandex/siteverify, maintenance on/off, mockup comparison,
      axe, leak scan; fixed the stale «Пароли не совпадают.» on `/register` — done
      2026-10-15, ported to `feat/legal-consents`. See docs/changelog.md
- [x] CR-267 `apps/api` test files in parallel: one Postgres copy and one Redis
      database per Vitest worker; order/timing dependencies fixed — done 2026-10-15.
      See docs/changelog.md
- [x] CR-266 CI split into parallel jobs `unit`/`checks`/`e2e` + gate job `ci` (the
      required check), ~12 → ~5 min — done 2026-10-15. See docs/changelog.md
- [x] CR-265 maintenance mode by env (`MAINTENANCE_MODE`, 503 + `Retry-After`, the
      «Техработы» screen), unexpected-error state, static 503 fallback at Caddy
      (ADR-040) — done 2026-10-14, committed on `feat/cr-265-maintenance-mode`. See docs/changelog.md
- [x] CR-264 `/login` to the auth mockup («Вход»: story text, Google/Yandex ID first,
      «или через email», «Забыли пароль?» by the field, show/hide); Yandex/social-only
      sign-in checks re-proven — done 2026-10-14, committed on `experiments`. See docs/changelog.md
