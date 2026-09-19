# syntax=docker/dockerfile:1
#
# CR-074. Build context is the monorepo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY=... .
#
# Three stages: `deps` (install once, cache-friendly), `builder` (compile the
# Next.js standalone output), `runner` (the actual runtime image — no
# devDependencies, no source, no pnpm store, non-root user).

FROM node:25-alpine AS deps
RUN corepack enable
WORKDIR /app

# Only the manifests every workspace member needs for `pnpm install` to
# resolve the full dependency graph (pnpm-lock.yaml's importers list every
# member — installing with a subset present desyncs `--frozen-lockfile`).
# Copied individually, not `COPY . .`, so editing application source doesn't
# invalidate this layer.
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

# Next.js inlines every `NEXT_PUBLIC_*` value into the client bundle at build
# time — this must be the restricted-by-domain MapGL key
# (`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`), never `MAPS_2GIS_API_KEY` (the
# server-side geocoder/directions key billed per request — see
# `.claude/rules/maps.md` and `.env.example`).
ARG NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY
ENV NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY=$NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY
ENV NODE_ENV=production
RUN pnpm --filter web build

# `output: 'standalone'` (apps/web/next.config.ts) traces only the modules
# each page actually needs into `.next/standalone`, nested at
# `apps/web/server.js` relative to the monorepo root because Next
# auto-detects the workspace root from the lockfile. `.next/static` and
# `public` are deliberately left out of that trace (Next's own documented
# standalone caveat) and are copied separately below.
FROM node:25-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
