import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site/site-url';

// QA live audit 2026-10-08, item 7. The cabinets are behind a session and the
// API is data, not pages. The auth pages stay crawlable on purpose: they
// carry `noindex`, which a crawler only sees if it may fetch them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/me', '/organizer', '/admin', '/api/'],
    },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
