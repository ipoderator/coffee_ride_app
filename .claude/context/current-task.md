# Current task

## CR-159 — Fix KI-080: light-theme `--danger` contrast

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-159.

- [x] Light `--danger` `#D42B20` → `#B92A1E` (`packages/ui/src/tokens.css`),
      AA against `--bg` and `ErrorState`'s tint, not just white.
- [x] `docs/design.md` §3 swatch table/prose updated.
- [x] Storybook's `KI_080_DANGER_CONTRAST` axe exception removed (file
      deleted, 4 story files no longer import it).
- [x] ui/web typecheck+lint+test green; `test:storybook` 59/59, zero axe
      rules disabled; visually checked via `storybook-mcp`.
- [x] KI-080 archived as resolved.

## CR-158 — Storybook for UI primitives and ride components

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-158.

Request (owner): Storybook via `create storybook --features docs test a11y` +
`@storybook/addon-mcp`, `componentsManifest` on; stories for Button, Input, Badge,
RideCard, RideStatus, RideFilters with light/dark themes and loading/error/empty/
disabled; a11y + interaction tests; no product UI change; run it and connect it to
Claude Code (`storybook-mcp`, project scope).

- [x] Storybook in `apps/web` (nextjs-vite); addons vitest/a11y/docs/mcp.
- [x] Six story files, every state + dark + both-themes; `play` tests.
- [x] `test:storybook` 59/59 (axe WCAG 2.1 AA as errors); unit 490/490.
- [x] Dev server on :6006, `/mcp` answers; `.mcp.json` has `storybook-mcp`.
- Found: KI-080 (light `--danger` contrast) — scoped exception in 7 stories.

## CR-157 — Larger, easier date picker on the create-ride page

Status: **done, not committed** (2026-09-29). Validation: see `docs/changelog.md`
CR-157. Previous task CR-156 (wizard) is done and committed (`765771f`).

Request (owner, screenshot of Safari's native date popup): «сделай календарь
удобнее и больше на странице создания заезда».

### Acceptance

- [x] Larger day targets (48px), readable numbers, Russian month/weekday names.
- [x] Faster picking: «Сегодня / Завтра / Сб / Вс» quick picks; past days disabled.
- [x] Phone: bottom sheet, no horizontal scroll; keyboard + screen-reader support.
- [x] Value contract unchanged (`YYYY-MM-DD`), create flow + e2e green.
