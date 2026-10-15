import type { MetadataRoute } from 'next';
import type { ListPublicRidesResponse } from 'types';
import { API_INTERNAL_URL, siteUrl } from '@/lib/site/site-url';

// QA live audit 2026-10-08, item 7: the catalog and its upcoming public
// rides — the pages worth finding. Regenerated hourly; at `next build` (no
// API in the image build) and on any API failure it is the catalog alone.
export const revalidate = 3600;

const SITEMAP_RIDE_LIMIT = 100;
const LOOKUP_TIMEOUT_MS = 3_000;

async function upcomingRides(): Promise<ListPublicRidesResponse['items']> {
  try {
    const response = await fetch(
      `${API_INTERNAL_URL}/v1/rides?limit=${SITEMAP_RIDE_LIMIT}`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (!response.ok) return [];
    return ((await response.json()) as ListPublicRidesResponse).items;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const rides = await upcomingRides();
  return [
    { url: new URL('/', base).toString(), changeFrequency: 'hourly' },
    // CR-247: public documents (Google's OAuth consent screen links them).
    { url: new URL('/privacy', base).toString(), changeFrequency: 'yearly' },
    { url: new URL('/terms', base).toString(), changeFrequency: 'yearly' },
    // CR-269: the separate consent to processing (ADR-041).
    {
      url: new URL('/personal-data-consent', base).toString(),
      changeFrequency: 'yearly',
    },
    ...rides.map((ride) => ({
      url: new URL(`/rides/${ride.id}`, base).toString(),
      lastModified: ride.updatedAt,
    })),
  ];
}
