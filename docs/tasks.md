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

- [x] CR-240..CR-243 (production QA 6–9) phone menu modal (Esc, focus, inert page);
      no overflow at 320–1023 px (scroll-row fades, header bar from `lg`); share/`.ics`
      feedback + fallbacks; group chip resync, `fitBounds` guards, menu semantics,
      visible focus — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-239 (production QA) ride page in sync after cancel/register: counts, start
      number and the phone bar land together; bar shows the count, not «№ N» —
      done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-238 (production QA) the organizer sees their hidden riders list on the ride
      page — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-237 (production QA) «Закрыть регистрацию» asks first and says it is
      irreversible — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-236 (production QA) create form: adjacent-month calendar days pickable
      (`DatePicker`), field errors clear on change; profile link not reproduced —
      done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-235 (P0, production QA) draft «Опубликовать» validates and saves the form
      before publishing; a failed save publishes nothing; one save + one publish on a
      double click — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-234 «Синхронизировать со Strava» (ADR-033): a participant backs the finish
      claim with their own Strava ride (one-shot OAuth, no stored tokens, ≥70% of the
      route within 200 m); organizer sees only «Проверено Strava» — done 2026-10-11
- [x] CR-232 item 7 — admin validation sweep (320/390/1280 × themes, filters,
      disposable mutations) + review fixes: malformed id → not found, encoded ids,
      non-JSON errors, dialog locked while sending — done 2026-10-10 on `feat/admin-panel`
