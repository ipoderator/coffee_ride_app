import type { NextConfig } from 'next';

// CR-075 (production reverse proxy) is deliberately not built yet. Instead,
// the browser only ever calls same-origin `/api/v1/...` paths (ADR-013:
// single origin, no CORS) and Next rewrites them to `apps/api` — in dev/this
// deploy, `API_INTERNAL_URL` (server-only; never exposed to the browser).
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // CR-074: the Docker runtime image copies only `.next/standalone`'s traced
  // output (a minimal `node_modules` plus the built server), not the full
  // monorepo — see `apps/web/Dockerfile`.
  output: 'standalone',
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
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
