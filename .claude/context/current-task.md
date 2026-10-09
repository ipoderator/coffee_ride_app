# Current task — CR-227 — direct links in transactional email + Unisender error detail

Source: owner, 2026-10-09 (chat). Production email (Unisender Go, paid tariff) delivers,
but every link is rewritten to the link-tracking domain `links.coffeeride.site`, whose NS
delegation to `uns1-3.unisender.com` answers REFUSED — verify-email/reset links dead.
Prod runs `AUTH_SKIP_EMAIL_VERIFICATION=true` meanwhile.

## Requirements / acceptance

- `email/send.json` body carries `track_links: 0, track_read: 0` — links in verify/reset
  emails go straight to `coffeeride.site` (tokens never pass a third-party redirector).
- A failed send logs Unisender's own `code`/`message` (e.g. 229, 903), not only
  "Operation failed after retries." — never the API key.
- Unit tests cover both; api typecheck/lint pass.
- Deployed to prod; test send succeeds; owner re-enables verification after a live check.

## Planned files

`apps/api/src/lib/email/unisender-provider.ts`, `unisender-provider.test.ts`.

## Progress / validation

- unit 6 passed, typecheck/lint/prettier clean, file coverage up; context updated. Next: commit, deploy, live check.
