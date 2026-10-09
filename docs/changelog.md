# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~15 entries, move all but the most recent ~8 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly,
and update the pointer line below. Routine work reads only the last 3 entries of the
_live_ file (`awk` on `^## 20`, or `tail`) — the archive exists for humans and for deep
audits (grep it by CR id), not for routine agent context. (CR-202 lowered this from ~40/~15.)

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed and why, in 1-3 sentences (≤ ~600 characters).
Contract: API/types/ui contract changes, migrations — or "none".
Files: key files/dirs touched (globs, not every test file).
Validation: commands run + pass counts, one line.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

Detail beyond that (root-cause narratives, live-verification transcripts) belongs in the
commit message body or the KI entry, not here — every agent re-reads these entries.

---

Entries before CR-219 (CR-000 through CR-218, 2026-09-09..2026-10-07) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226),
per this section's own rule.

## 2026-10-08 — CR-219 — First production deploy to coffeeride.site

Summary: CR-217/218 committed (`1f741cf`, CI green incl. `docker-smoke`), cloned to `/opt/deployments/coffee-ride` on the VPS, `.env` generated (hex secrets; 2GIS demo + Unisender keys from the dev `.env`; `ACME_EMAIL=admin@coffeeride.site`), `deploy/deploy.sh` exit 0. Caddy obtained Let's Encrypt certificates for `coffeeride.site` and `www.` (new 301 to the bare domain, `c43ce63`). The old Sept-27 verification stack in `/opt/coffee-ride` was stopped (volumes kept); ufw opened 80/443.
Contract: none.
Files: `deploy/Caddyfile`, `docs/deployment.md` ("Production host"), context files.
Validation: `caddy validate`; FIRST-DEPLOY §1–4, §6: all 7 services up, postgres/redis/s3 healthy; `/health` db/redis/s3 `ok`; `curl` without `-k`: `/` 200, `www` 301, http 308, `/api/v1/rides` 200; headless browser `/`, `/login` — 0 console errors, 0 failed requests; `X-Request-Id` = api `reqId`, real client IP in api logs; first backup dump present.
Decisions: host convention `/opt/deployments/<project>`; root SSH stays disabled (deploy as `gleb` + sudo).
Follow-up: §5 email flow fails by construction until `EMAIL_FROM_ADDRESS` is a verified Unisender sender; off-host backup copy not set up; KI-045 narrowed to these.

## 2026-10-08 — CR-220 — Skip email verification on the test deploy

Summary: Owner: production is a test deploy without a mail sender, so email verification must go. New env `AUTH_SKIP_EMAIL_VERIFICATION` (`true`/`false`, default off, allowed in production): `registerUser` inserts the user with `emailVerified = true` and no token; `/register` sends no email and no dev link. Preflight warns while it is on. The register success card says no inbox step is needed.
Contract: none (`emailVerified` was already in the response).
Files: `apps/api/src/{env,preflight}.ts`(+tests), `modules/auth/auth.{service,routes}.ts`(+test), `RegisterForm.tsx`(+test, story), `terminology.ts`, `docker-compose.prod.yml`, `deploy/production.env.example`, `docs/deployment.md`.
Validation: api env/preflight/auth 79 passed; web register 16; storybook EmailVerification 8 (axe); typecheck + lint api/web/ui.
Follow-up: accounts registered before the switch stay unverified — one-off `UPDATE users SET email_verified = true` on the server; unset the flag before real users.

## 2026-10-08 — CR-221 — Start time saved as shown (QA live audit item 1, P1)

Summary: The wizard saved «12:12» for a start shown as «08:00»: the controlled `<input type="time">` held a value React never heard about (a native picker/tool changing it without an `input` event); picking the GPX re-rendered the form over it and the save sent the stale state. New `ui` `TimeInput` (browser-owned field, React writes it only when `value` changes); create, edit and reschedule read it through a ref at save. `zonedTimeToUtcIso` now does its documented second offset pass.
Contract: `ui` — new `TimeInput`; `InputProps` is `ComponentProps<'input'>` (adds `ref`, additive).
Files: `packages/ui/src/components/{TimeInput,Input}.tsx`, `CreateRideForm`, `EditRideForm`, `RescheduleRideCard`, `lib/datetime/zoned-time.ts`, `e2e/ride-start-time.spec.ts`, `stories/TimeInput.stories.tsx`.
Validation: e2e `ride-start-time` 2 passed (the desync case reproduced 12:12 before the fix); `zoned-time` 14 (day/year edges, zone change, DST second pass — fails one-pass); `TimeInput` 5; storybook 28.
Decisions: server/DB path verified clean (no API change); the QA report's 12:12 is the DOM/state split, reproduced in the e2e by setting the field without an event.
Follow-up: none.

## 2026-10-08 — CR-222 — Registered ticket no longer reads «Список ожидания» (item 2, P2)

Summary: The ticket chip was the ride's seat status (`posterStatusTerm`), so the holder of the last seat — directly or by waitlist promotion — saw «Список ожидания». New `ticketStatusTerm`: registered → «Место подтверждено» (success) until the ride starts, then the ride's progress; waitlisted → «Список ожидания»; every other face unchanged.
Contract: `ui` — `RIDE_TICKET_TERMS.registeredStatus`.
Files: `ride-detail/lib/ticket-state.ts`(+test), `RideDetailView.tsx`, `terminology.ts`, `e2e/registration-waitlist.spec.ts`, `RegistrationTicket.stories.tsx`.
Validation: ticket-state 30 (all ten faces); e2e registration-waitlist 1 passed (direct + promoted chips); storybook `RegisteredOnFullRide`.
Decisions: none.
Follow-up: none.

## 2026-10-08 — CR-223 — Cabinet sign-in returns to the deep link (item 3, P2)

Summary: `CabinetShell` sent a guest to a bare `/login`; it now replaces to `loginHref(<path+query+hash>)` — CR-141's validated `next` — so `/me*`/`/organizer*` deep links survive sign-in.
Contract: none.
Files: `components/cabinet/CabinetShell.tsx`(+test), `e2e/login-return.spec.ts`.
Validation: CabinetShell + login 20 passed; e2e login-return 4 passed (new: `/me/rides?tab=history` → login → back).
Decisions: none.
Follow-up: the ~2 s skeleton before the redirect (audit UX note) would need a server-side gate — not done.

## 2026-10-08 — CR-224 — Real 404 for a missing ride, branded 404 page (items 4–5, P2)

Summary: `/rides/[id]` answered 200 and said «не найден» only client-side. The page now asks `apps/api` server-to-server (`lib/rides/server-ride.ts`: UUID guard, 3 s timeout, the viewer's cookie + `X-Forwarded-For` forwarded, `react.cache`) and calls `notFound()` on its 404 only. New `app/not-found.tsx` and `rides/[id]/not-found.tsx` share `NotFoundPanel` (Russian `h1`, «Вернуться к заездам»), also used by `RideDetailView`'s own not-found state.
Contract: `ui` — `NOT_FOUND_TERMS`; web runner image gets `API_INTERNAL_URL` at runtime.
Files: `app/rides/[id]/{page,not-found}.tsx`, `app/not-found.tsx`, `components/site/NotFoundPanel.tsx`, `lib/rides/server-ride.ts`(+test), `apps/web/Dockerfile`, `e2e/not-found.spec.ts`.
Validation: e2e not-found 4 passed (missing/malformed → 404 + h1, unknown URL, draft 404 to a guest / 200 to its owner); unit 5+5; prod build checked on :3100.
Decisions: a timeout/5xx still renders the page (client states) — only a definite 404 is a 404.
Follow-up: KI-096 — the 404 body is client-rendered (Next 16 SSR shell for `notFound()` in a page).

## 2026-10-08 — CR-225 — Named, 44 px 2GIS map controls (item 6, P2)

Summary: MapGL's zoom buttons (32×32, icon only) and 2GIS link had no accessible name. `maps-2gis/control-a11y.ts` finds them by shape (hashed SDK classes) — the one parent with two unnamed buttons, zoom-in first; the `2gis` link — names them and sizes the buttons 44×44 via inline style, re-applied by a `childList` MutationObserver disconnected on `destroy()`. Labels come from `MAP_CONTROL_TERMS` at the composition point (`TwoGisMapRendererConfig.controlLabels`).
Contract: `maps-2gis` config `controlLabels?` (additive; `maps-core` unchanged); `ui` — `MAP_CONTROL_TERMS`.
Files: `packages/maps-2gis/src/{control-a11y,render,index}.ts`(+tests), `lib/maps/create-map-renderer.ts`, `terminology.ts`.
Validation: maps-2gis 79 passed; live map: a11y tree «Увеличить масштаб»/«Уменьшить масштаб»/link, both 44×44, screenshot checked.
Decisions: no SDK option exists for labels, so the adapter post-processes its own DOM — the only package allowed to know MapGL's markup.
Follow-up: a MapGL update changing the control markup would silently drop the labels — checked by eye only.

## 2026-10-08 — CR-226 — SEO files, share metadata, full page CSP (items 7–8, P3)

Summary: `robots.ts` (cabinets/API disallowed, sitemap link), `sitemap.ts` (catalog + upcoming public rides, hourly), `metadataBase`/Open Graph/Twitter in the layout, canonical on `/` and each ride, ride title/description metadata, `noindex` on the five auth pages and drafts. Page CSP is now a full allowlist from a browser inventory (self + `mapgl.2gis.com` script, `*.2gis.com` connect/img, `blob:` workers; `'unsafe-eval'`/`ws:` dev only) plus `Permissions-Policy`. Zod's eval probe is off in browsers (`jitless`) so prod pages raise no CSP violation.
Contract: new env `SITE_URL` (`https://${DOMAIN}` build arg in prod compose, runner env); `turbo.json` build/dev env.
Files: `app/{robots,sitemap,layout}.ts(x)`, `lib/site/*`, `lib/security/headers.ts`(+test), `next.config.ts`, auth pages, `packages/types/src/zod-config.ts`, `Dockerfile`, `docker-compose.prod.yml`, `turbo.json`.
Validation: unit seo/page/site-url/headers 22 passed; prod build + standalone on :3100: 0 CSP violations on map/ride/404/login, map renders, canonical `https://coffeeride.site`; full e2e 55 passed.
Decisions: scripts keep `'unsafe-inline'` — a nonce makes every page dynamic (KI-097).
Follow-up: KI-097; no `manifest.webmanifest` (needs icon set + theme colours).

## 2026-10-09 — CR-227 — Direct links in transactional email; Unisender refusals logged

Summary: Production email went live on Unisender Go (paid tariff; sender domain + DKIM confirmed, link-tracking domain `links.coffeeride.site` added because send.json refuses with code 229 without one). That domain's NS delegation answers REFUSED, so every rewritten verify/reset link was dead. The provider now sends `track_links: 0, track_read: 0` — links go straight to the site and single-use tokens never pass a third-party redirector. A refused send now logs Unisender's `code`/`message` (emails redacted) instead of the generic "Operation failed after retries.".
Files: `apps/api/src/lib/email/unisender-provider.ts`(+test).
Validation: email unit tests 6 passed; api typecheck/lint/prettier clean; file coverage up (branches 78.6 → 80 %).
Follow-up: prod still runs `AUTH_SKIP_EMAIL_VERIFICATION=true` until the owner checks a live verify link.
