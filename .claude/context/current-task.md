# Current task — CR-221..CR-226 live QA audit fixes — DONE locally (not committed)

Source: owner, 2026-10-08 — `~/Documents/ChatGPT/КофеРайд/CLAUDE_CODE_FIX_PROMPT.md` +
`QA_LIVE_AUDIT_coffeeride.site_2026-10-08.md` (production `8896469`). Branch
`experiments`, local only.

## Triage

| #   | Priority | Item                                        | Reproduced?                                   | Kind      | CR     |
| --- | -------- | ------------------------------------------- | --------------------------------------------- | --------- | ------ |
| 1   | P1       | Start 08:00 saved/shown as 12:12            | yes — e2e, field set without `input` event    | bug       | CR-221 |
| 2   | P2       | Registered ticket chip «Список ожидания»    | yes — code + unit (full ride → waitlist term) | bug       | CR-222 |
| 3   | P2       | Cabinet gate drops `next`                   | yes — `router.replace('/login')`              | bug       | CR-223 |
| 4   | P2       | Missing ride → HTTP 200, no `h1`            | yes — curl 200                                | bug       | CR-224 |
| 5   | P2       | Unbranded English 404                       | yes — no `app/not-found.tsx`                  | UX fix    | CR-224 |
| 6   | P2       | MapGL controls unnamed, 32×32               | yes — a11y tree in a live browser             | UX fix    | CR-225 |
| 7   | P3       | robots/sitemap/OG/canonical/noindex missing | yes — curl 404                                | UX fix    | CR-226 |
| 8   | P3       | Page CSP minimal, no Permissions-Policy     | yes — headers                                 | hardening | CR-226 |

Not taken: the report's UX notes (320 px bottom bar, password confirm/show, skeleton
before redirect, bottom-nav on auth pages) and `manifest.webmanifest` — no fix requested.

## Acceptance criteria → evidence

- 08:00 survives GPX pick, draft save, step 4, reload; Europe/Moscow; zone/day edges —
  `e2e/ride-start-time.spec.ts` (2), `zoned-time.test.ts` (14), `TimeInput.test.tsx` (5).
- Registered chip on a full ride, direct + promoted — `ticket-state.test.ts`,
  `e2e/registration-waitlist.spec.ts`; other faces unchanged (same test).
- `next` preserved — `CabinetShell.test.tsx`, `e2e/login-return.spec.ts`.
- Real 404 + Russian `h1` + CTA — `e2e/not-found.spec.ts` (4), prod build curl.
- Map controls named, 44×44 — `control-a11y.test.ts`, live a11y tree + screenshot.
- SEO files/metadata — `seo.test.ts`, `rides/[id]/page.test.tsx`, prod build output.
- CSP without breaking map/images/API/hydration — prod build on :3100, 0 violations,
  map renders; full e2e on dev with the CSP enforced.

## Validation

- format (changed files), `lint:root` (only the untracked, gitignored `brag-output/`),
  turbo lint + typecheck 17/17, types/ui/maps-2gis/web typecheck.
- unit: web 808, ui 254+, maps-2gis 79, api rides 281 (types change).
- storybook: 29 files / 208 tests (axe).
- coverage (web/ui/maps-2gis, no MapGL key): every touched total ≥ baseline
  (web +0.58 lines, ui +0.02 stmts, maps-2gis +0.05); api not re-measured
  (untouched); baseline file not updated.
- e2e (local dev, chromium + mobile): 55 passed; 12 screenshot specs fail only for
  missing `*-darwin.png` (Linux-only baselines) — not run in Docker amd64.
- production build (worktree) + standalone server: statuses, CSP, map, no page errors.
- `21st review` — not run (no such tool/CLI available here).

## Final result

All 8 audit items fixed locally; KI-096 (404 body client-rendered), KI-097 (scripts
keep `'unsafe-inline'`) recorded. Nothing committed or deployed.
