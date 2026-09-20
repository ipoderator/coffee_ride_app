# Current task

Task ID: CR-099 (fix QA findings — dark theme, public nav, verify-email link,
forgot/reset-password + verify-email screens, cabinet route loading states).

Status: **Done.**

## Goal

Fix the real bugs from a user-run QA pass against a live browser session:

1. Dark theme tokens exist (`packages/ui/src/tokens.css`) but nothing ever
   activates them — no `prefers-color-scheme` detection, no toggle. `.dark`
   is applied nowhere. `docs/design.md` §"Dark theme": "not optional or
   later."
2. No shared nav/header on `/`, `/register`, `/login` — no way to move
   between them or into a cabinet without typing a URL.
3. Register success screen's "verification link" is `/v1/auth/verify-email?
token=...` — a relative path missing `/api`, and a POST-only endpoint, not
   a GET page. Following it in a browser 404s. Mechanism itself works (KI-026
   already documented the missing screen).
4. `/forgot-password`, `/reset-password`, `/verify-email` all 404 — API
   exists (KI-042, KI-026), no screens.
5. Organizer cabinet screens (edit ride, route, cover) show only the static
   `<h1>` for ~2-3.5s with no loading indicator before their skeleton mounts
   — no Next.js `loading.tsx` boundary on the route segment, so the RSC
   navigation itself shows nothing changing.
6. 2GIS map shows no visible street geometry in a headless sandbox browser.
7. Duplicate `GET /v1/organizers/me` observed on `/organizer` and
   `/organizer/profile`.

## Scope decisions (before implementing)

- **#1 Dark theme**: implement OS-preference activation only (`prefers-
color-scheme`, applied via an inline pre-hydration script setting `.dark`
  on `<html>`, avoiding FOUC). No manual toggle UI — `docs/design.md` never
  requires one, only that the theme exists and activates.
- **#2 Nav**: new `SiteHeader` (client component, `packages/ui`-token
  styled, Russian strings from `terminology.ts`), applied only to `/`,
  `/register`, `/login` via a new `(public)` route group + layout — scoped
  to exactly the three routes the finding named, not a wider restructure.
  Shows Войти/Регистрация when logged out, Личный кабинет/Кабинет
  организатора/Выйти when logged in (reuses `getCurrentUser()`).
- **#3/#4**: build real `/verify-email`, `/forgot-password`, `/reset-
password` pages (closes KI-026 and KI-042's screen gap) as new
  `features/auth/*` modules, same pattern as `register`/`login`. Register's
  dev-note now links to the real `/verify-email?token=...` web page instead
  of the raw API path.
- **#5**: add `apps/web/src/app/organizer/rides/[id]/loading.tsx` — one
  shared Next.js loading boundary for `edit`/`route`/`cover` (and their
  siblings `participants`/`updates`, same segment) so navigation shows
  immediate skeleton feedback instead of nothing until the RSC payload
  arrives.
- **#6**: investigated, not fixed — this matches CR-098's already-documented
  finding (`known-issues.md` KI-036 update / `project-state.md`): real key,
  real tile/style requests, real correctly-positioned markers, confirmed via
  network/DOM inspection; flat visual background is a headless/software-
  WebGL rasterization limit of the sandbox, not an integration bug. No code
  change. Recommend the user re-check in a normal (non-headless, GPU-backed)
  browser.
- **#7**: investigated, not a bug — both pages fetch `getOrganizerProfile()`
  from exactly one `useEffect` each (`OrganizerProfileWidget`,
  `OrganizerProfileForm`). The duplicate request is React 18 Strict Mode's
  intentional dev-only double-invoke of effects (Next.js's default
  `reactStrictMode: true`, `next.config.ts` has no override) — mount →
  cleanup → remount, guarded correctly against a double `setState` by each
  effect's own `cancelled` flag, but the underlying `fetch` still fires
  twice. Universal to every `useEffect`-based fetch in this codebase, not
  specific to these two files; does not happen in a production build; not
  worth removing Strict Mode (a real safety net) to silence. No code change.

## Planned files

- `apps/web/src/app/layout.tsx` (theme script)
- `apps/web/src/app/(public)/layout.tsx` (new), `page.tsx`, `register/
page.tsx`, `login/page.tsx` (moved from `app/`)
- `apps/web/src/components/site/SiteHeader.tsx` (new)
- `apps/web/src/features/auth/verify-email/{api.ts,components/
VerifyEmailStatus.tsx,verify-email.test.tsx}` (new)
- `apps/web/src/features/auth/forgot-password/{api.ts,components/
ForgotPasswordForm.tsx,forgot-password.test.tsx}` (new)
- `apps/web/src/features/auth/reset-password/{api.ts,components/
ResetPasswordForm.tsx,reset-password.test.tsx}` (new)
- `apps/web/src/app/verify-email/page.tsx`, `app/forgot-password/page.tsx`,
  `app/reset-password/page.tsx` (new)
- `apps/web/src/features/auth/register/components/RegisterForm.tsx` (link
  fix)
- `apps/web/src/app/organizer/rides/[id]/loading.tsx` (new)
- `packages/ui/src/terminology.ts` (new terms: `SITE_HEADER_TERMS`, verify/
  forgot/reset password screen copy)
- Docs: `known-issues.md` (KI-026, KI-042 resolved), `docs/changelog.md`,
  `docs/tasks.md`, `.claude/context/project-state.md`,
  `.claude/context/architecture-map.md` if nav component changes structure.

## Implementation progress

All planned files done, as scoped above. `RegisterForm`/`LoginForm` also
gained direct cross-links (`/login`↔`/register`, `/forgot-password`) beyond
the header, and the register dev-note now derives the real `/verify-email`
web path from the API's raw `verificationUrl` instead of rendering it
verbatim.

## Validation results

- `pnpm --filter ui typecheck` — clean.
- `pnpm --filter web typecheck` — clean (after `rm -rf apps/web/.next`
  cleared a stale `.next/types` artifact from the `(public)` route move,
  same category of gotcha CR-093/CR-098 already hit).
- `pnpm --filter web lint` — clean.
- `pnpm --filter web test` — 208/208 passing (10 new: verify-email,
  forgot-password, reset-password).
- `NODE_ENV=production pnpm --filter web build` — clean, all 21 routes
  compiled including the three new ones.
- `npx prettier --write` run over every doc/code file this task touched;
  `docs/tasks.md`'s remaining `prettier --check` warning confirmed
  pre-existing (reproduces against `main` via `git stash`, unrelated to this
  task).
- Live-verified in a real browser (killed a stray leftover `next-server` on
  :3000 first — an unrelated pre-existing process from before this session,
  serving a stale build that was blocking the CSRF Origin check from
  matching), against the real running stack (real Postgres, real API):
  - `/login`, `/register`, `/` all render `SiteHeader` with all five links
    resolving correctly; zero console errors, zero failed requests.
  - Dark mode: emulated `prefers-color-scheme: dark` — `<html>` gains
    `.dark`, `body`'s computed background flips from `rgb(250, 249, 247)`
    (`#faf9f7`) to `rgb(23, 22, 20)` (`#171614`) — exact token match.
  - Registered a real account through the UI, clicked the rendered
    verification link exactly as a user would, landed on `/verify-email`,
    got "Email подтверждён".
  - `/forgot-password` showed the correct generic success state for a real
    registered email. `/reset-password` with no token showed the correct
    missing-token error.
  - Test accounts created during verification deleted from the dev DB
    afterward; dev server stopped; stray `next-server` process not
    restarted (was unrelated leftover state, not this session's).

## Discovered issues

None beyond the two findings that turned out not to be bugs (documented in
the Scope decisions section above, not re-listed here).

## Final result

All five real bugs fixed and live-verified; two findings investigated and
correctly identified as non-bugs with no code change. Docs updated:
`docs/changelog.md` (CR-099 entry), `docs/tasks.md` (checked off),
`.claude/context/project-state.md` (overwritten), `.claude/context/
architecture-map.md` (CR-099 entry), `.claude/context/known-issues.md`
(KI-026/KI-042 narrowed with update paragraphs), `.claude/context/
known-issues-archive.md` (KI-052/053/054, new — dark theme, public nav,
loading boundary — added directly since fully resolved same session, per
`CLAUDE.md`'s "move immediately, not as periodic batch cleanup").
