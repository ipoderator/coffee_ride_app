import { afterEach, describe, expect, it, vi } from 'vitest';
import { create2GisMapProvider } from './provider.js';
import { MapProviderError } from './errors.js';

// Fixture shapes below mirror a real response verified against a live 2GIS
// account 2026-09-19 (KI-016, resolved) — these tests exercise this
// adapter's parsing/fallback/timeout-normalization logic against that
// verified shape, not a live call on every run.

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

  // CR-147: the Catalog API reports errors as HTTP 200 + `meta.code`.
  it('treats meta.code 404 as no results', async () => {
    mockFetchOnce({
      json: async () => ({
        meta: { code: 404, error: { type: 'itemNotFound' } },
      }),
    });

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('nowhere')).resolves.toEqual([]);
  });

  it('rejects any other non-200 meta.code as MapProviderError with that status', async () => {
    mockFetchOnce({
      json: async () => ({ meta: { code: 403, error: { type: 'keyError' } } }),
    });

    const provider = create2GisMapProvider(config);
    await expect(provider.geocode('x')).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'unavailable',
      status: 403,
    });
    await expect(
      provider.reverseGeocode({ lat: 1, lng: 2 }),
    ).rejects.toMatchObject({ status: 403 });
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
  it('parses total_distance/total_duration and the maneuvers WKT geometry from an array-shaped response', async () => {
    mockFetchOnce({
      json: async () => [
        {
          total_distance: 1200,
          total_duration: 300,
          maneuvers: [
            {
              outcoming_path: {
                geometry: [
                  {
                    selection:
                      'LINESTRING(2.000000 1.000000, 4.000000 3.000000)',
                  },
                ],
              },
            },
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
        result: [
          {
            total_distance: 500,
            total_duration: 60,
            maneuvers: [
              {
                outcoming_path: {
                  geometry: [{ selection: 'LINESTRING(2 1, 4 3)' }],
                },
              },
            ],
          },
        ],
      }),
    });

    const provider = create2GisMapProvider(config);
    const result = await provider.getRoute({
      points: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      profile: 'driving',
    });

    expect(result.distanceMeters).toBe(500);
    expect(result.durationSeconds).toBe(60);
  });

  // Regression: the adapter used to return the request waypoints themselves
  // here — straight lines that cut across rivers and relief on the map.
  it('never falls back to straight lines between the waypoints: no geometry is a no_route error', async () => {
    mockFetchOnce({ json: async () => [{ distance: 500, duration: 60 }] });

    const provider = create2GisMapProvider(config);
    await expect(
      provider.getRoute({
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
        ],
        profile: 'walking',
      }),
    ).rejects.toMatchObject({ name: 'MapProviderError', code: 'no_route' });
  });

  it('treats a 204 No Content answer as no_route, not as an outage', async () => {
    mockFetchOnce({ status: 204, json: async () => undefined });

    const provider = create2GisMapProvider(config);
    await expect(
      provider.getRoute({
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
        ],
        profile: 'cycling',
      }),
    ).rejects.toMatchObject({ code: 'no_route' });
  });

  it('asks for bicycle transport with altitudes, and reads a Z coordinate as elevation', async () => {
    const fetchMock = mockFetchOnce({
      json: async () => [
        {
          total_distance: 1500,
          total_duration: 400,
          maneuvers: [
            {
              outcoming_path: {
                geometry: [
                  // Altitudes in centimetres, as 2GIS sends them.
                  { selection: 'LINESTRING Z(2 1 15050, 3 2 15200)' },
                  { selection: 'LINESTRING Z(3 2 15200, 4 3 14900)' },
                ],
              },
            },
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

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({ transport: 'bicycle', need_altitudes: true });
    // The shared joint vertex between the two segments appears once.
    expect(result.geometry).toEqual([
      { lat: 1, lng: 2, elevationMeters: 150.5 },
      { lat: 2, lng: 3, elevationMeters: 152 },
      { lat: 3, lng: 4, elevationMeters: 149 },
    ]);
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

// CR-137. The mocks above reject `fetch` outright; these let the request
// actually hang, so the adapter's own timeout has to cut it off.
describe('a hung 2GIS request', () => {
  function stubHangingFetch() {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const ROUTE_REQUEST = {
    points: [
      { lat: 55.75, lng: 37.6 },
      { lat: 55.76, lng: 37.61 },
    ],
    profile: 'cycling' as const,
  };

  it('times out into MapProviderError after one bounded retry', async () => {
    const fetchMock = stubHangingFetch();
    const provider = create2GisMapProvider({ apiKey: 'k', timeoutMs: 30 });

    const started = Date.now();
    await expect(provider.getRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'unavailable',
      message: expect.stringMatching(/timed out after 30ms/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('opens the circuit after repeated timeouts and then fails without calling 2GIS', async () => {
    const fetchMock = stubHangingFetch();
    const provider = create2GisMapProvider({ apiKey: 'k', timeoutMs: 10 });

    // Five failed calls (each with its retry) reach the breaker threshold.
    for (let i = 0; i < 5; i += 1) {
      await expect(provider.geocode('Москва')).rejects.toThrow(
        MapProviderError,
      );
    }
    const callsBeforeOpen = fetchMock.mock.calls.length;

    await expect(provider.getRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'MapProviderError',
      message: '2GIS is temporarily unavailable.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOpen);
  });
});

// CR-137. Valid JSON in a shape the adapter doesn't know (an API change, a
// proxy's error page as JSON, a partial answer) must come out as a
// MapProviderError the callers already handle — never a raw TypeError that
// turns into a 500.
describe('a well-formed but unexpected 2GIS response', () => {
  const ROUTE_REQUEST = {
    points: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
    profile: 'cycling' as const,
  };

  it.each([
    ['result is an object, not a list', { result: {} }],
    ['a string body', 'Service temporarily unavailable'],
    [
      'maneuvers is not a list',
      [{ total_distance: 1, total_duration: 1, maneuvers: {} }],
    ],
    [
      'distance is not a number',
      [
        {
          total_distance: '1200',
          total_duration: 300,
          maneuvers: [
            {
              outcoming_path: {
                geometry: [{ selection: 'LINESTRING(2 1, 4 3)' }],
              },
            },
          ],
        },
      ],
    ],
    [
      'geometry is not a list',
      [
        {
          total_distance: 1,
          total_duration: 1,
          maneuvers: [{ outcoming_path: { geometry: 'LINESTRING(2 1, 4 3)' } }],
        },
      ],
    ],
  ])('getRoute: %s → MapProviderError unavailable', async (_label, body) => {
    mockFetchOnce({ json: async () => body });

    const provider = create2GisMapProvider(config);
    await expect(provider.getRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'unavailable',
    });
  });

  it.each<[string, Parameters<typeof mockFetchOnce>[0]]>([
    [
      '204 No Content (null body)',
      { status: 204, json: async () => undefined },
    ],
    [
      'items is an object, not a list',
      { json: async () => ({ result: { items: {} } }) },
    ],
    [
      'a point with non-numeric coordinates',
      {
        json: async () => ({
          result: {
            items: [{ full_name: 'x', point: { lat: '55', lon: null } }],
          },
        }),
      },
    ],
  ])('geocode: %s never throws a TypeError', async (_label, response) => {
    mockFetchOnce(response);

    const provider = create2GisMapProvider(config);
    const outcome = await provider.geocode('x').then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    if ('error' in outcome) {
      expect(outcome.error).toBeInstanceOf(MapProviderError);
    } else {
      // A result may only ever contain real coordinates.
      for (const item of outcome.value) {
        expect(Number.isFinite(item.point.lat)).toBe(true);
        expect(Number.isFinite(item.point.lng)).toBe(true);
      }
    }
  });

  it('reverseGeocode: a 204 No Content answer is "nothing here", not a crash', async () => {
    mockFetchOnce({ status: 204, json: async () => undefined });

    const provider = create2GisMapProvider(config);
    await expect(
      provider.reverseGeocode({ lat: 55.75, lng: 37.6 }),
    ).resolves.toBeNull();
  });
});
