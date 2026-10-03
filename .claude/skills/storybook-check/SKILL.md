---
name: storybook-check
description: Use after ANY change to a frontend component in apps/web or packages/ui — new or changed component, state, prop, Russian string or token — before calling the task done; also on "проверь в Storybook", "добавь story". Ensures every touched component has stories for its states in both themes and that `test:storybook` (render + play + axe WCAG 2.1 AA) passes.
---

# Storybook check

Read first: `.claude/rules/testing.md` → "Storybook (CR-158)". Owner's rule: every
frontend element in use has a story, and every frontend change is checked in
Storybook — no "too trivial" exemption.

## Steps

1. **Touched components:** `git diff --name-only -- apps/web/src packages/ui/src`
   → the components (`*.tsx`, not tests). For each, find its story:
   `grep -l "<ComponentName>" apps/web/src/stories/*.stories.tsx`.
2. **Missing or incomplete story** → add/extend `apps/web/src/stories/<Name>.stories.tsx`:
   - one story per state the change touched: default, loading, error, empty,
     disabled, and any dialog/confirm state (left open so axe checks it);
   - theme via `globals: { theme: 'dark' | 'both' }` where colour matters;
   - stub the API per story with `beforeEach` (pattern: `RideFilters.stories.tsx`,
     fixtures in `stories/fixtures.ts`), never mock the component itself;
   - a `play` function for interactive states (`userEvent`, `expect`).
3. **Run:** `pnpm --filter web test:storybook`, or for one file
   `npx vitest run --project storybook src/stories/<Name>.stories.tsx`. This spins
   up its own instance — trust it over a long-running :6006 server, which serves a stale
   `packages/ui` after edits (restart the server; clearing its cache doesn't help).
4. **Axe violation** → fix the component (contrast via tokens, labels, roles). Only a
   genuinely external cause may be excepted: scope the exception to the affected
   stories, name its KI, and keep the list in `src/stories/a11y-known-issues.ts`
   (create it on first use) — never a global rule switch in `.storybook/preview.tsx`.
5. **Visual look** (optional, for design work): `pnpm --filter web storybook` on
   :6006; the `storybook-mcp` server (`.mcp.json`) can then render stories. If it's
   unreachable, use `browser-automation` on `localhost:6006/?path=/story/...` — and
   say which way it was checked.
6. Record story count/result in `current-task.md` validation (e.g. "Storybook
   178/178 with axe").
