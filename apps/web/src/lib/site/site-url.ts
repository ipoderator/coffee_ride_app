// QA live audit 2026-10-08, item 7: canonical URLs, Open Graph, `robots.txt`
// and `sitemap.xml` need the public origin. `SITE_URL` is
// `https://${DOMAIN}` in `docker-compose.prod.yml` — a build arg (static
// pages and `robots.txt` bake it at `next build`) and runner env
// (`apps/web/Dockerfile`), like `API_INTERNAL_URL`. Unset → local dev.
const LOCAL_SITE_URL = 'http://localhost:3000';

export function siteUrl(): URL {
  const raw = process.env.SITE_URL;
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // A malformed value must not take every page's metadata down.
    }
  }
  return new URL(LOCAL_SITE_URL);
}

/** The server-only origin `next.config.ts` rewrites `/api/v1/*` to. */
export const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
