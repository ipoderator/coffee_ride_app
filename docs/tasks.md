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

- [x] CR-262 `/register` to the auth mockup (story panel, Google/Yandex ID first,
      strength meter, live match, show/hide), `confirmPassword` checked by the API, no
      account enumeration on register (ADR-039) — done 2026-10-14 on `experiments`, not
      committed (owner). See docs/changelog.md
- [x] CR-261 (security) Google reCAPTCHA v2 on register/password login/forgot-password,
      verified server-side, failing closed; «Повторите пароль» on register (ADR-038) —
      done 2026-10-14, one PR with CR-260 (`feat/yandex-oauth-recaptcha`). See docs/changelog.md
- [x] CR-260 Yandex ID sign-in («Войти через Яндекс») beside Google: PKCE/state code
      flow, shared race-safe account linking, one button block (ADR-037) — done
      2026-10-14, one PR with CR-261 (`feat/yandex-oauth-recaptcha`). See docs/changelog.md
- [x] CR-259 (security, KI-097) page CSP by per-request nonce + `'strict-dynamic'`,
      no `'unsafe-inline'` for scripts; every page renders per request (ADR-036) —
      done 2026-10-14 on `feat/nonce-csp`. See docs/changelog.md
- [x] CR-253..CR-258 (security, Lictor audit) verified email to join a ride, hidden
      ride's reviews + no review `userId`, per-user upload tier, auth event log, logout
      cookie `Secure` (KI-099), digest-pinned base images — done 2026-10-14 on
      `fix/security-audit-findings`. See docs/changelog.md
- [x] CR-252 (tooling, security) vendored the Lictor security-audit skills
      (`lictor-security-check`/`-explain`/`-fix-it`/`-rotate`, pinned upstream commit),
      routed in CLAUDE.md; `SECURITY-AUDIT.md` gitignored — done 2026-10-14 on
      `chore/lictor-security-skills`. See docs/changelog.md
- [x] CR-251 (security) Redis command args (a queued job's email + one-time link)
      redacted from every API log line — done 2026-10-14 on
      `fix/redact-redis-command-args`. See docs/changelog.md
- [x] CR-250 (security, LOW) the per-account auth rate-limit Redis key is an
      HMAC of the normalized email, and its fail-open warning no longer logs the key —
      done 2026-10-13 on `fix/account-rate-limit-key-hmac`. See docs/changelog.md
- [x] CR-249 Google sign-in claims an unverified account with the same email
      (ADR-035): verified, password/sessions/pending links voided, then linked —
      done 2026-10-13. See docs/changelog.md
