# Current task — CR-206: ponytail-audit low-risk cleanups — DONE (committed)

Source: owner — installed the `ponytail` plugin globally, ran `/ponytail-audit` on the
repo, then "исправь то, у чего низкий риск каких-либо поломок всего приложения".
Branch `main`.

## Goal

Apply only the audit findings whose removal cannot change application behavior:
unused dependency declarations and one single-caller helper. Explicitly out of scope:
the `uploadRoute`/`replaceRoute` and `uploadCoverImage`/`replaceCoverImage`
deduplication (a logic change in the file-upload paths — not low risk).

1. `class-variance-authority` — declared in `apps/web`, zero references repo-wide.
2. `postgres` — declared in `apps/api`, imported only by `packages/db` (which declares
   it in its own deps).
3. `clsx` + `tailwind-merge` — declared in `apps/web`, but the only `cn()` lives in
   `packages/ui` (which declares both itself); `apps/web/src/lib/utils.ts` just
   re-exports it.
4. `formatPriceParts` — the only one of ten `*Parts` helpers with no caller outside
   `format.ts`; inline it into `formatPrice`.

Kept deliberately: `apps/web/src/lib/utils.ts` (0 importers, but `components.json`'s
`aliases.utils` points at it — removing it breaks `shadcn add` generation);
`react-dom` in `apps/web` (`createPortal` in `packages/ui/Dialog.tsx`);
`@2gis/mapgl` (dynamic `await import()` in `packages/maps-2gis/src/render.ts`).

## Acceptance criteria

- The four dependency entries gone from `apps/web`/`apps/api` `package.json`;
  `pnpm install` regenerates the lockfile with no other change in intent.
- `formatPriceParts` no longer exported; `formatPrice` keeps its exact output
  (`1 500 ₽`, `Бесплатно`); its test still covers both cases.
- typecheck, lint, affected unit tests, and both app builds green.
- No behavior change anywhere.

## Planned files

- `apps/web/package.json`, `apps/api/package.json`, `pnpm-lock.yaml`
- `packages/ui/src/format.ts`, `packages/ui/src/format.test.ts`

## Progress

- [x] `class-variance-authority`, `clsx`, `tailwind-merge` removed from `apps/web`
- [x] `postgres` removed from `apps/api`, then **restored** — see "Discovered issues"
- [x] `formatPriceParts` inlined into `formatPrice`; its redundant test dropped
      (`formatPrice` was already covered for 1500/0/null/undefined)
- [x] validation
- [x] context updated (changelog, tasks.md, project-state.md)

## Validation results

- `pnpm --filter ui test` — 245 passed (33 files)
- `pnpm --filter web test` — 772 passed (68 files)
- `pnpm --filter web test:storybook` — 196 passed (27 files, render + play + axe)
- `pnpm typecheck` 8/8, `pnpm lint` 9/9, `pnpm format:check` clean, `pnpm build` 7/7
- built API smoke test (`node dist/server.js`, the one `scripts/build.mjs` mandates):
  `/health` → 200 `{"status":"ok","dependencies":{"db":"ok","redis":"not_configured","s3":"ok"}}`
- api vitest NOT run: `TEST_DATABASE_URL` needs the Docker postgres, but port 5432 is
  held by the owner's native `postgresql@14` brew service (not stopped — the owner's
  dev database lives there). The diff touches no `apps/api` file, and the built server
  was verified live instead.

## Discovered issues

1. **`postgres` must stay a direct `apps/api` dependency.** Removed it (nothing under
   `apps/api/src` imports it), then restored it: `apps/api/scripts/build.mjs` documents
   that esbuild inlines `packages/db`'s source, so the _bundle_ requires `postgres`,
   and pnpm only symlinks a package's own declared deps into its `node_modules`.
   `pnpm build` succeeds either way — only `node dist/server.js` catches it. The file
   even predicts this exact class of mistake; `apps/api/package.json` is back to HEAD.
2. **Lint caught my own regression**: literal NBSP characters in the new `formatPrice`
   doc comment tripped `no-irregular-whitespace`. Replaced with ordinary spaces.
3. `apps/web/src/lib/utils.ts` has 0 importers but `components.json`'s `aliases.utils`
   points at it — kept, since removing it breaks `shadcn add` generation.
4. `apps/web/coverage/` is committed to the repository (surfaced during the audit
   greps). Possibly unintended — worth a `.gitignore` check.

## Final result

Three unused dependency declarations gone from `apps/web`; one single-caller helper
inlined. No behavior change, no contract change. The audit's upload/replace duplication
findings (~65 duplicated lines across `rides.service.ts`) are deliberately left — they
are a logic change in the GPX/cover-image upload paths, outside "low risk".
