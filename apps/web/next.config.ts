import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// CR-111. Next only auto-loads `.env` from its own project directory, but this
// monorepo keeps one `.env` at the root (matching `.env.example`) and
// `apps/api` loads it the same explicit way (`apps/api/src/server.ts`). Without
// this, every `NEXT_PUBLIC_*` var — notably the MapGL key — was silently
// undefined in the browser bundle, so `createMapRenderer()` always returned
// `null` and both maps showed their degraded state forever.
//
// A variable already present in the real environment wins over the file's value
// (verified against Node's own behavior, not assumed), so a platform that
// injects env vars directly — `docker-compose.prod.yml`'s `web` service, CI —
// is unaffected. Local dev only: a missing file is not an error.
try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../.env'));
} catch {
  // no .env file present — expected outside local dev
}

// CR-075 (production reverse proxy) is deliberately not built yet. Instead,
// the browser only ever calls same-origin `/api/v1/...` paths (ADR-013:
// single origin, no CORS) and Next rewrites them to `apps/api` — in dev/this
// deploy, `API_INTERNAL_URL` (server-only; never exposed to the browser).
// CR-134: read at `next build`, not at runtime — the destination is baked
// into routes-manifest.json, so a Docker image needs it as a build arg
// (apps/web/Dockerfile), never only as a container env var.
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

// CR-205: security headers for every page `web` serves — CR-061's helmet only
// covers `apps/api`'s own responses, and Caddy (`deploy/Caddyfile`) adds none.
// No script/style CSP on purpose: Next's inline bootstrap scripts, the theme
// init script (`app/layout.tsx`) and 2GIS MapGL would each need nonces/hosts
// verified first; the directives below restrict nothing a page loads.
// HSTS: browsers ignore it over plain `http://`, so local dev is unaffected.
// `/api/*` is excluded — those responses are the API's, with helmet's headers.
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  // CR-074: the Docker runtime image copies only `.next/standalone`'s traced
  // output (a minimal `node_modules` plus the built server), not the full
  // monorepo — see `apps/web/Dockerfile`.
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/((?!api/).*)', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_INTERNAL_URL}/v1/:path*`,
      },
    ];
  },
  // `packages/types` (KI-017: exports raw TS source, no `dist` build consumed
  // yet) is written for `tsc`'s NodeNext resolution, so its own internal
  // relative imports use an explicit `.js` extension pointing at `.ts` files
  // (correct for `tsc`/`tsx`, which both understand that convention).
  // Webpack doesn't, by default — `apps/web` is `types`' first bundler-based
  // consumer (CR-011), so this is the first build that needs the alias.
  //
  // CR-212: this alias is also why `apps/web` stays on webpack under Next 16,
  // whose default bundler is Turbopack. Turbopack has no `extensionAlias`
  // equivalent (vercel/next.js#82945, still open) and `resolveExtensions`
  // does not substitute — it appends extensions to an extensionless request
  // rather than rewriting `.js` to `.ts`, verified by building against it:
  // 144 `Can't resolve './api/*.js'` errors from `packages/types` alone.
  // Removing the `.js` extensions instead is not an option either: every
  // workspace package compiles as `module: NodeNext`, which *requires* them
  // (TS2835). Serving built `dist` output from these packages would fix it
  // for any bundler, but that reverses ADR-017's deliberate raw-TS exports
  // and `packages/ui` has no build step at all — an ADR, not an upgrade.
  // So `dev`/`build` pass `--webpack` explicitly (apps/web/package.json);
  // webpack remains a supported opt-out in 16, with no announced removal.
  // Revisit when #82945 lands — then this whole block can go.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
