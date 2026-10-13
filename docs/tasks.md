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

- [x] CR-250 (security, LOW) the per-account auth rate-limit Redis key is an
      HMAC of the normalized email, and its fail-open warning no longer logs the key —
      done 2026-10-13 on `fix/account-rate-limit-key-hmac`. See docs/changelog.md
- [x] CR-249 Google sign-in claims an unverified account with the same email
      (ADR-035): verified, password/sessions/pending links voided, then linked —
      done 2026-10-13. See docs/changelog.md
- [x] CR-247 Google sign-in (OIDC, PKCE/state/nonce) into the existing DB session,
      `auth_identities` + nullable `password_hash` (migration `0028`), button on
      `/login`/`/register` keeping `next`, Russian `/privacy` and `/terms` (ADR-034) —
      done 2026-10-13 on `feat/google-oauth`, committed (PR into `main`). See docs/changelog.md
- [x] CR-246 (production QA) Strava sync: a cancel reads «Подключение Strava
      отменено», an expired `state` returns to the ride, `/me/rides` shows the
      outcome toast, a return without a verified ride offers «Проверить поездку
      снова» — done 2026-10-13 on `fix/strava-sync-qa`. See docs/changelog.md
- [x] CR-245 (production QA) the emailed verification link keeps `next`, so
      «Перейти ко входу» returns to the page registration started from (KI-089) —
      done 2026-10-12 on `fix/verify-email-next`. See docs/changelog.md
- [x] CR-244 (production QA) password-reset email «not sent» — investigated on
      production: the typed address matched no account (Gmail `+` alias); no
      defect — 2026-10-12. See docs/changelog.md
- [x] CR-240..CR-243 (production QA 6–9) phone menu modal (Esc, focus, inert page);
      no overflow at 320–1023 px (scroll-row fades, header bar from `lg`); share/`.ics`
      feedback + fallbacks; group chip resync, `fitBounds` guards, menu semantics,
      visible focus — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-239 (production QA) ride page in sync after cancel/register: counts, start
      number and the phone bar land together; bar shows the count, not «№ N» —
      done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
- [x] CR-238 (production QA) the organizer sees their hidden riders list on the ride
      page — done 2026-10-12 on `fix/publish-saves-form`. See docs/changelog.md
