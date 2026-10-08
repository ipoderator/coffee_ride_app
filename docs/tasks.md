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

- [x] CR-221 Start time saved as shown: `ui` `TimeInput` read at save in create/edit/
      reschedule; zoned-time second pass (QA live audit 2026-10-08 item 1, P1) — done
      2026-10-08. See docs/changelog.md
- [x] CR-222 Registered ticket chip «Место подтверждено», not «Список ожидания»
      (item 2) — done 2026-10-08
- [x] CR-223 Cabinet auth gate carries `?next=` back after sign-in (item 3) — done
      2026-10-08
- [x] CR-224 Real HTTP 404 for a missing ride + branded `not-found.tsx` (items 4–5;
      KI-096) — done 2026-10-08
- [x] CR-225 2GIS zoom/attribution controls named, 44×44 (item 6) — done 2026-10-08
- [x] CR-226 robots/sitemap/OG/canonical/noindex, full page CSP + Permissions-Policy
      (items 7–8; KI-097) — done 2026-10-08
- [x] CR-220 Test-deploy switch `AUTH_SKIP_EMAIL_VERIFICATION`: new accounts
      start verified, no email — done 2026-10-08. See docs/changelog.md
- [x] CR-219 First production deploy: coffeeride.site live on the VPS
      (`/opt/deployments/coffee-ride`), Let's Encrypt via Caddy, `www.` → 301 —
      done 2026-10-08. See docs/changelog.md
