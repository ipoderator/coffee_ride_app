# syntax=docker/dockerfile:1
#
# CR-076. Build context is the monorepo root: docker build -f packages/db/Dockerfile .
#
# A small, single-purpose image for one job: run `packages/db/src/migrate.ts`
# (the advisory-lock-guarded migration script) as an explicit deploy step —
# never on `apps/api`'s own boot (docker-compose.prod.yml's `migrate` service,
# gated behind a Compose profile). Unlike apps/web's or apps/api's images
# (CR-074), this one runs from source via `tsx` rather than a production
# bundle — it's a short-lived one-shot job, not a long-running service, so
# CR-074's image-size discipline doesn't apply the same way; keeping
# devDependencies (`tsx`) is simpler than adding a build step for a script
# that already runs correctly via `tsx` in CI and local dev.

FROM node:25-alpine AS deps
RUN corepack enable
WORKDIR /app

# Same reasoning as apps/web/Dockerfile and apps/api/Dockerfile: every
# workspace member's manifest, individually, not `COPY . .` — pnpm-lock.yaml's
# importers list every member, so installing with a subset present desyncs
# `--frozen-lockfile`.
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

FROM deps AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs migrator
COPY packages/db/src ./packages/db/src
COPY packages/db/migrations ./packages/db/migrations
RUN chown -R migrator:nodejs /app/packages/db

USER migrator
CMD ["pnpm", "--filter", "db", "db:migrate"]
