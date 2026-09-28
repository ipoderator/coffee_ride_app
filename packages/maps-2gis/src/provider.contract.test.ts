import { describe, expect, it } from 'vitest';
import { MapProviderError } from './errors.js';
import { create2GisMapProvider } from './provider.js';

// CR-137. Contract test against the real 2GIS Geocoder/Routing APIs: the
// fixtures in `provider.test.ts` mirror a response captured once (KI-016);
// this checks that 2GIS still answers in that shape, with our key.
//
// Never part of an ordinary run. It needs RUN_2GIS_CONTRACT_TESTS=1 and
// MAPS_2GIS_API_KEY, which only `.github/workflows/maps-contract.yml` sets —
// a manual/scheduled job bound to the protected `maps-2gis-contract`
// environment, never on pull requests (the key must not reach fork code,
// and every call spends quota). Locally:
//   RUN_2GIS_CONTRACT_TESTS=1 MAPS_2GIS_API_KEY=… pnpm --filter maps-2gis test
const apiKey = process.env.MAPS_2GIS_API_KEY;
const enabled = process.env.RUN_2GIS_CONTRACT_TESTS === '1' && !!apiKey;

// Live network: generous per-call timeout, one bounded retry in the adapter.
const TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 30_000;

// Red Square and a point ~2 km south-west along the embankment (Moscow).
const RED_SQUARE = { lat: 55.7539, lng: 37.6208 };
const GORKY_PARK = { lat: 55.7312, lng: 37.6034 };
// Solovki: an island with no bridge, within 50 km of the mainland: the
// demo key rejects points further apart with a 403 (CR-147 — Moscow →
// Reykjavik got "excessive distance between points for demo-keys").
const SOLOVETSKY_MONASTERY = { lat: 65.0245, lng: 35.711 };
const RABOCHEOSTROVSK = { lat: 64.989, lng: 34.779 };

function distanceMeters(a: { lat: number; lng: number }, b: typeof a) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

describe.skipIf(!enabled)('2GIS contract (live API)', () => {
  const provider = create2GisMapProvider({
    apiKey: apiKey ?? '',
    timeoutMs: TIMEOUT_MS,
  });

  it(
    'geocode: a well-known address resolves to a labelled point nearby',
    async () => {
      const results = await provider.geocode('Москва, Красная площадь');

      expect(results.length).toBeGreaterThan(0);
      const [first] = results;
      expect(first!.label).not.toBe('');
      expect(distanceMeters(first!.point, RED_SQUARE)).toBeLessThan(2000);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'reverseGeocode: a coordinate resolves to a labelled place',
    async () => {
      const result = await provider.reverseGeocode(RED_SQUARE);

      expect(result).not.toBeNull();
      expect(result!.label).not.toBe('');
      expect(distanceMeters(result!.point, RED_SQUARE)).toBeLessThan(2000);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'getRoute: a cycling route follows the road graph between the points',
    async () => {
      const route = await provider.getRoute({
        points: [RED_SQUARE, GORKY_PARK],
        profile: 'cycling',
      });
      const straight = distanceMeters(RED_SQUARE, GORKY_PARK);

      // Road-following: many vertices, never just the two waypoints.
      expect(route.geometry.length).toBeGreaterThan(10);
      expect(route.distanceMeters).toBeGreaterThanOrEqual(straight * 0.95);
      expect(route.distanceMeters).toBeLessThan(straight * 3);
      expect(route.durationSeconds).toBeGreaterThan(0);
      // Starts and ends near the requested points.
      expect(distanceMeters(route.geometry[0]!, RED_SQUARE)).toBeLessThan(500);
      expect(distanceMeters(route.geometry.at(-1)!, GORKY_PARK)).toBeLessThan(
        500,
      );
      // `need_altitudes`: Moscow is ~120–250 m above sea level.
      const elevations = route.geometry
        .map((point) => point.elevationMeters)
        .filter((value): value is number => value !== undefined);
      expect(elevations.length).toBeGreaterThan(0);
      for (const elevation of elevations) {
        expect(elevation).toBeGreaterThan(50);
        expect(elevation).toBeLessThan(400);
      }
    },
    TEST_TIMEOUT_MS,
  );

  // KI-056: points no road connects. Live answer (CR-147): HTTP 200 with
  // `{ type: 'error', status: 'ROUTE_DOES_NOT_EXISTS' }` → `no_route` (API
  // 422), not "maps unavailable".
  it(
    'getRoute: points no road connects fail as no_route',
    async () => {
      const error = await provider
        .getRoute({
          points: [RABOCHEOSTROVSK, SOLOVETSKY_MONASTERY],
          profile: 'cycling',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(MapProviderError);
      expect(
        (error as MapProviderError).code,
        `status=${(error as MapProviderError).status} ${(error as Error).message}`,
      ).toBe('no_route');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'an invalid key is rejected as MapProviderError with the HTTP status',
    async () => {
      const badProvider = create2GisMapProvider({
        apiKey: 'coffee-ride-contract-test-invalid-key',
        timeoutMs: TIMEOUT_MS,
      });

      const error = await badProvider.geocode('Москва').catch((e) => e);

      expect(error).toBeInstanceOf(MapProviderError);
      expect([401, 403]).toContain(error.status);
    },
    TEST_TIMEOUT_MS,
  );
});
