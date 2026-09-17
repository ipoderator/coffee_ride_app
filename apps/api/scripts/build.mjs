import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// ADR-017 (`docs/decisions.md`), resolving KI-017: a plain `node
// dist/server.js` can't resolve `db`/`types`/`resilience`'s own
// `.js`-suffixed NodeNext-style relative imports, since their
// `package.json` `exports` point at raw `.ts` source (kept that way
// deliberately — `tsx watch`/`vitest` handle it fine, and rewriting it would
// mean every dev/test consumer needs a dual source/dist export condition).
// Bundling `apps/api`'s own build fixes the one broken path (this app's
// compiled production boot) without touching any of that.
const WORKSPACE_PACKAGES = ['db', 'types', 'resilience'];

function readDependencies(relativePkgPath) {
  const url = new URL(relativePkgPath, import.meta.url);
  const pkg = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
  return Object.keys(pkg.dependencies ?? {});
}

// The correct `external` set is NOT just `apps/api`'s own `dependencies` —
// `db`'s runtime dependency on `postgres` isn't declared on `apps/api`'s
// `package.json` by itself, only reachable transitively today. esbuild
// can't tell a workspace package apart from a real npm package via its
// built-in `packages: 'external'` (pnpm symlinks both under `node_modules`
// identically), so this unions every bundled package's own `dependencies`
// instead — real npm packages (`fastify`, `argon2`, `bullmq`, `postgres`,
// ...) stay external and are resolved from `node_modules` at runtime exactly
// as today; workspace source gets inlined. Never bundling a native addon
// (`argon2`) matters, not just avoiding unnecessary work.
//
// One real gap this surfaced (not hypothetical — hit it live building this):
// marking `postgres` external isn't enough on its own under pnpm's strict,
// non-hoisted `node_modules` — a plain `node dist/server.js` resolves a bare
// specifier from `apps/api/node_modules`, which never gets a `postgres`
// entry unless `apps/api`'s own `package.json` declares it directly (pnpm
// only symlinks a package's *own* declared dependencies into its
// `node_modules`, not a workspace dependency's dependencies too). So
// `apps/api/package.json` now lists `postgres` as a direct dependency, even
// though no file under `apps/api/src` ever imports it — the bundle does,
// once `db`'s source is inlined, which makes it a genuine runtime
// dependency of this app now, not a phantom one. If a future change adds a
// new real dependency to `db`/`types`/`resilience` that isn't already a
// direct `apps/api` dependency, re-run the `NODE_ENV=production node
// dist/server.js` smoke test (not just `pnpm build`, which would still
// succeed) — that's what actually catches this class of gap.
const external = [
  ...new Set([
    ...readDependencies('../package.json'),
    ...readDependencies('../../../packages/db/package.json'),
    ...readDependencies('../../../packages/types/package.json'),
    ...readDependencies('../../../packages/resilience/package.json'),
  ]),
].filter((name) => !WORKSPACE_PACKAGES.includes(name));

await build({
  entryPoints: [fileURLToPath(new URL('../src/server.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/server.js', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
