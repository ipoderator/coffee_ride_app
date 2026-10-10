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

- [x] CR-232 item 7 — admin validation sweep (320/390/1280 × themes, filters,
      disposable mutations) + review fixes: malformed id → not found, encoded ids,
      non-JSON errors, dialog locked while sending — done 2026-10-10 on `feat/admin-panel`
- [x] CR-232 item 6 — overview counters link to list filters + «Обновить»; log
      filters by target type/action (URL), deleted target shows its id — done 2026-10-10
- [x] CR-232 item 5 — admin list search/filters in the URL (back/forward, card
      round trip, junk-safe) — done 2026-10-10 on `feat/admin-panel`
- [x] CR-232 item 4 — mobile `CabinetSectionTabs` scrolls the active tab into view
      (load + navigation, reduced-motion aware) — done 2026-10-10 on `feat/admin-panel`
- [x] CR-232 item 3 — per-action reason hint (organizer sees a ride's hide reason;
      the rest are log-only) — done 2026-10-10 on `feat/admin-panel`
- [x] CR-232 item 2 — admin reason dialogs name the record (email / ride title /
      review author, rating, excerpt) — done 2026-10-10 on `feat/admin-panel`
- [x] CR-232 item 1 — `admin:grant` refuses an account with an unconfirmed email
      (`email_not_verified`, exit 1) — done 2026-10-10 on `feat/admin-panel`
- [x] CR-228..CR-231 Admin panel P0 (ADR-032): `platform_admins` + CLI grant,
      `/v1/admin/*`, block/hide/cancel enforcement, `/admin` web section (Обзор,
      Пользователи, Заезды, Отзывы, Журнал), organizer sees why a ride is hidden —
      done 2026-10-10 on local branch `feat/admin-panel` (not merged/deployed)
