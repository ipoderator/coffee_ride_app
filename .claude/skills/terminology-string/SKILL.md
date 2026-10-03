---
name: terminology-string
description: Use whenever a user-visible Russian string is added or changed — a label, button, error line, empty state, plural count, status name — in apps/web or packages/ui ("добавь текст", "переименуй кнопку", "поправь формулировку"). Puts it in packages/ui/src/terminology.ts under the right *_TERMS group with correct plurals/formatting and a test, never as a literal in a component.
---

# Russian UI string

Read first (only the relevant parts): `docs/design.md` §6–7 (metrics, Russian
formatting), §13 (terminology); `.claude/rules/frontend.md`. The module is large
(~2300 lines) — don't read it whole; grep.

## Steps

1. **Reuse before adding.** `grep -n "<word>" packages/ui/src/terminology.ts` — the
   same concept must keep the same word everywhere (no per-screen synonyms; e.g.
   «Заезд», not «Поездка»). Existing groups: `UI_TERMS`, `AUTH_TERMS`,
   `CABINET_TERMS`, `RIDE_*_TERMS`, `VALIDATION_TERMS`, `AVATAR_TERMS`, …
   (`grep -n "^export const" packages/ui/src/terminology.ts`).
2. **Place it** in the feature's existing `*_TERMS` object; a new object only for a
   new screen/feature, named `<FEATURE>_TERMS`, exported via `packages/ui`'s index.
   Enum labels go in the `Record<Enum, string>` maps so a new enum value fails
   typecheck until labelled.
3. **Formatting:** counts via the module's `pluralRu` (one/few/many), numbers/dates/
   units via `packages/ui/src/format.ts` (tabular numerals, NBSP before units, `—`
   for missing, never `0`); «ё» where Russian requires it; typographic quotes «…».
4. **Errors:** forms show only Russian lines — map API `code`/Zod issue codes to
   `VALIDATION_TERMS`/feature terms; never render `problem.detail`, `error.message`
   or a Zod message (guarded by `apps/web/src/lib/forms/russian-errors-guard.test.ts`).
5. **Test:** add/extend the matching `packages/ui/src/terminology*.test.ts` (plural
   edges 1/2/5/11/21/22 for counts) — `packages/ui` coverage has a floor (CR-179/193).
6. **Contract:** changing an existing key's wording is fine; renaming/removing a key
   means checking every usage in both cabinets (`grep -rn "<KEY>" apps/web/src`).
7. Component consumes it; then `storybook-check` for the screen.
