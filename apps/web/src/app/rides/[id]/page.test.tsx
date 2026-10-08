import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRideLookup } from '@/lib/rides/server-ride';

const lookupRide = vi.fn<(id: string) => Promise<ServerRideLookup>>();
vi.mock('@/lib/rides/server-ride', () => ({
  lookupRide: (id: string) => lookupRide(id),
}));
const notFound = vi.fn(() => {
  throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

const { default: RideDetailPage, generateMetadata } = await import('./page');

const params = Promise.resolve({ id: 'ride-1' });

function found(
  ride: Partial<Extract<ServerRideLookup, { kind: 'found' }>['ride']>,
) {
  return {
    kind: 'found',
    ride: {
      id: 'ride-1',
      title: 'Ночной Гравел',
      description: null,
      status: 'registration_open',
      ...ride,
    },
  } as ServerRideLookup;
}

beforeEach(() => {
  lookupRide.mockReset();
  notFound.mockClear();
});

// QA live audit 2026-10-08, items 4 and 7.
describe('/rides/[id]', () => {
  it('answers 404 when the API says the ride does not exist', async () => {
    lookupRide.mockResolvedValue({ kind: 'not_found' });
    await expect(RideDetailPage({ params })).rejects.toThrow('404');
    expect(notFound).toHaveBeenCalled();
  });

  it('renders the page when the ride exists or the lookup is inconclusive', async () => {
    lookupRide.mockResolvedValue({ kind: 'unknown' });
    await expect(RideDetailPage({ params })).resolves.toBeTruthy();
    lookupRide.mockResolvedValue(found({}));
    await expect(RideDetailPage({ params })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('titles, describes and canonicalises a public ride', async () => {
    lookupRide.mockResolvedValue(found({ description: 'Кофе на 40-м км.' }));
    const metadata = await generateMetadata({ params });
    expect(metadata).toMatchObject({
      title: 'Ночной Гравел — Coffee Ride',
      description: 'Кофе на 40-м км.',
      alternates: { canonical: '/rides/ride-1' },
      openGraph: { siteName: 'Coffee Ride', url: '/rides/ride-1' },
      twitter: { card: 'summary' },
    });
    expect(metadata.robots).toBeUndefined();
  });

  it('keeps a draft out of the index and falls back to the site description', async () => {
    lookupRide.mockResolvedValue(found({ status: 'draft' }));
    const metadata = await generateMetadata({ params });
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.description).toBe(
      'Платформа для поиска, организации и участия в групповых велозаездах.',
    );
  });

  it('adds nothing for a ride it could not read', async () => {
    lookupRide.mockResolvedValue({ kind: 'unknown' });
    expect(await generateMetadata({ params })).toEqual({});
  });
});
