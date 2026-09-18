# syntax=docker/dockerfile:1
#
# CR-074. Build context is the monorepo root: docker build -f apps/api/Dockerfile .
#
# Three stages: `deps` (install once, cache-friendly), `builder` (produce the
# ADR-017 esbuild bundle, then prune it to a production-only dependency set),
# `runner` (the actual runtime image — no devDependencies, no source, no pnpm
# store, non-root user).

FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /app

# See apps/web/Dockerfile for why every workspace member's manifest is copied
# individually rather than `COPY . .` here.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/maps-core/package.json packages/maps-core/package.json
COPY packages/maps-2gis/package.json packages/maps-2gis/package.json
COPY packages/resilience/package.json packages/resilience/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .

# ADR-017: bundles db/types/resilience's source into one dist/server.js via
# esbuild; every real npm dependency (fastify, drizzle-orm, postgres, argon2,
# bullmq, ioredis, @aws-sdk/client-s3, sax, zod, @fastify/*) stays external.
RUN pnpm --filter api build

# Prune to a real, production-only install rather than shipping the whole
# monorepo's node_modules (devDependencies like vitest/tsx/eslint/typescript
# included). `pnpm deploy` is pnpm's own documented tool for exactly this in a
# monorepo, but needs two things to behave correctly here (both verified live
# on the host before writing this, not assumed):
#   - `inject-workspace-packages=true`, scoped to this one command via the
#     env var (not a repo-wide `.npmrc`, since that setting also changes how
#     ordinary `pnpm install` resolves every workspace:* dependency
#     everywhere else — symlink vs. a copied/injected dependency — which is a
#     real dev-workflow behavior change out of scope for a Docker-only need).
#     Without it, `pnpm deploy --prod` refuses with
#     ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE; the suggested `--legacy` fallback
#     was tried and rejected — it resolves the entire workspace lockfile
#     (hundreds of packages, including devDependencies and the root `prepare`
#     husky script) instead of a scoped prune, and pnpm itself marks it
#     "Experimental!".
#   - `apps/api/package.json`'s `"files": ["dist"]` — without it, pnpm's pack
#     step falls back to the root `.gitignore` for exclusions (no `files`
#     field, no `.npmrc`), and `dist` is gitignored repo-wide, so it would
#     silently drop the one directory this deploy actually exists to ship.
# `db`/`types`/`resilience` still get copied into the pruned node_modules as
# real (non-workspace-protocol) dependencies alongside them — harmless dead
# weight since their source is already inlined into dist/server.js, not a
# correctness problem.
RUN npm_config_inject_workspace_packages=true \
    pnpm --filter=api deploy --prod /prod/api

FROM node:24-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs fastify
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=fastify:nodejs /prod/api ./

USER fastify
EXPOSE 4000
CMD ["node", "dist/server.js"]
