import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';

// QA live audit 2026-10-08, item 7.
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://coffeeride.site');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('robots.txt', () => {
  it('keeps crawlers out of the cabinets and the API and points at the sitemap', () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/me', '/organizer', '/admin', '/api/'],
      },
      sitemap: 'https://coffeeride.site/sitemap.xml',
    });
  });
});

describe('sitemap.xml', () => {
  it('lists the catalog and every upcoming public ride', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        items: [{ id: 'ride-1', updatedAt: '2026-10-08T10:00:00.000Z' }],
      }),
    );
    expect(await sitemap()).toEqual([
      { url: 'https://coffeeride.site/', changeFrequency: 'hourly' },
      {
        url: 'https://coffeeride.site/rides/ride-1',
        lastModified: '2026-10-08T10:00:00.000Z',
      },
    ]);
  });

  it('is the catalog alone when the API answers an error or is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await sitemap()).toHaveLength(1);
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await sitemap()).toHaveLength(1);
  });
});
