# Current task — CR-259 — page CSP by per-request nonce (ADR-036, KI-097)

Source: owner, 2026-10-14 (answer to the handoff: «Переходить на nonce», «Деплой»,
Dependabot #18 — decide by security/priority). Branch `feat/nonce-csp` (worktree
`../coffeeride-csp`).

## Scope

- Script CSP: per-request nonce + `'strict-dynamic'`, no `'unsafe-inline'`
  (`apps/web/src/proxy.ts`); root layout reads `headers()` and passes the nonce to the
  theme script; other headers stay in `next.config.ts`.
- ADR-036; rules `do-not-break.md`/`security.md`; KI-097 archived.
- Dependabot #18 (`braces`, KI-095): kept open — an open alert is what produces the fix
  PR once a patch exists; dev-only risk.
- Deploy of `1e362ff` (CR-251, CR-253..CR-258): approved by the owner; the auto-mode
  classifier refused the deploy command — needs the owner's permission.

## Acceptance

No `'unsafe-inline'` in `script-src`; a fresh nonce per request matching every page
script; zero `securitypolicyviolation` on real pages incl. the MapGL map; web gates.

## Validation results

- web unit 944/944 with coverage, web above baseline (other packages untouched, not
  re-measured in this worktree); typecheck, lint, `lint:root`, `format:check`.
- `next build`: every page `ƒ` (dynamic); sitemap/robots/icon static.
- e2e `security-headers.spec.ts` 4/4 (isolated dev servers :3200/:4200, test DB).
- Production build on :3100, Chromium: `/`, `/?view=map` (MapGL loaded, tiles,
  canvas), `/login`, `/register`, ride 404 — no CSP violations, theme script ran.
- Not run locally: full e2e suite, `docker-smoke` (CI).

## Final result

Done on `feat/nonce-csp`; committed, PR into `main`; deploy of `main` after the merge (owner approved).
