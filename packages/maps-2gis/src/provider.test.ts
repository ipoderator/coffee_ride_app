import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapProvider } from './provider.js';
import { MapProviderError } from './errors.js';

// No live 2GIS credential is available in this environment (KI-016) — these
// tests exercise this adapter's own parsing/fallback/timeout-normalization
// logic against constructed fixture responses, not a real API call. They do
// NOT verify 2GIS's actual field names; that still needs a live account
// before CR-026/CR-028/CR-084 depend on this adapter for real.

const config = { apiKey: 'test-key', timeoutMs: 1000 };

function mockFetchOnce(
  overrides: Partial<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...overrides,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('geocode', () => {
  it('parses items with a point into GeocodeResult[], dropping the rest', async () => {
    mockFetchOnce({
      json: async () => ({
        result: {
          items: [
            {
              full_name: 'Moscow, Red Square',
              point: { lat: 55.75, lon: 37.62 },
            },
            { name: 'fallback label', point: { lat: 1, lon: 2 } },
            { full_name: 'no point, must be dropped' },
          ],
        },
      }),
    });

    const provider = create2GisMapProvider(config);
    const results = await provider.geocode('Красная площадь');

    expect(results).toEqual([
      { point: { lat: 55.75, lng: 37.62 }, label: 'Moscow, Red Square' },
      { point: { lat: 1, lng: 2 }, label: 'fallback label' },
    ]);
  });

  it('returns an empty array when the response has no items', async () => {
    mockFetchOnce({ json: async () => ({ result: {} }) });

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('nowhere')).resolves.toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('returns the first result', async () => {
    mockFetchOnce({
      json: async () => ({
        result: { items: [{ full_name: 'A', point: { lat: 1, lon: 2 } }] },
      }),
    });

    const provider = create2GisMapProvider(config);
    await expect(provider.reverseGeocode({ lat: 1, lng: 2 })).resolves.toEqual({
      point: { lat: 1, lng: 2 },
      label: 'A',
    });
  });

  it('returns null when there are no results', async () => {
    mockFetchOnce({ json: async () => ({ result: { items: [] } }) });

    const provider = create2GisMapProvider(config);
    await expect(
      provider.reverseGeocode({ lat: 1, lng: 2 }),
    ).resolves.toBeNull();
  });
});

describe('getRoute', () => {
  it('parses distance/duration/geometry from an array-shaped response', async () => {
    mockFetchOnce({
      json: async () => [
        {
          distance: 1200,
          duration: 300,
          geometry: [
            { lat: 1, lon: 2 },
            { lat: 3, lon: 4 },
          ],
        },
      ],
    });

    const provider = create2GisMapProvider(config);
    const result = await provider.getRoute({
      points: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      profile: 'cycling',
    });

    expect(result).toEqual({
      geometry: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      distanceMeters: 1200,
      durationSeconds: 300,
    });
  });

  it('also accepts the { result: [...] } wrapped response shape', async () => {
    mockFetchOnce({
      json: async () => ({
        result: [{ total_distance: 500, total_duration: 60 }],
      }),
    });

    const provider = create2GisMapProvider(config);
    const result = await provider.getRoute({
      points: [{ lat: 1, lng: 2 }],
      profile: 'driving',
    });

    expect(result.distanceMeters).toBe(500);
    expect(result.durationSeconds).toBe(60);
  });

  it('falls back to the requested waypoints when the response has no geometry', async () => {
    mockFetchOnce({ json: async () => [{ distance: 500, duration: 60 }] });

    const provider = create2GisMapProvider(config);
    const points = [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ];
    const result = await provider.getRoute({ points, profile: 'walking' });

    expect(result.geometry).toEqual(points);
  });

  it('throws MapProviderError when no usable route is present', async () => {
    mockFetchOnce({ json: async () => [] });

    const provider = create2GisMapProvider(config);
    await expect(
      provider.getRoute({ points: [{ lat: 1, lng: 2 }], profile: 'driving' }),
    ).rejects.toThrow(MapProviderError);
  });
});

describe('failure modes (.claude/rules/resilience.md)', () => {
  it('normalizes a non-2xx response into MapProviderError with the status', async () => {
    mockFetchOnce({ ok: false, status: 429 });

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('x')).rejects.toMatchObject({
      name: 'MapProviderError',
      status: 429,
    });
  });

  it('normalizes a fetch timeout (AbortSignal.timeout) into MapProviderError', async () => {
    const timeoutError = new Error('The operation was aborted.');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('x')).rejects.toThrow(MapProviderError);
  });

  it('normalizes an unparseable JSON body into MapProviderError', async () => {
    mockFetchOnce({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('x')).rejects.toThrow(MapProviderError);
  });
});
