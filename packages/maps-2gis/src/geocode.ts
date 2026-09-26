import type { GeocodeResult, LatLng } from 'maps-core/server';
import type { CircuitBreaker } from 'resilience';
import type { TwoGisProviderConfig } from './config.js';
import { DEFAULT_GEOCODER_BASE_URL, DEFAULT_TIMEOUT_MS } from './config.js';
import { fetchJson } from './http.js';
import { isRecord, optionalList } from './shape.js';

// 2GIS Geocoder API (https://docs.2gis.com/en/api/search/geocoder/overview),
// `GET {geocoderBaseUrl}/items/geocode`. Shape below reflects 2GIS's own
// documented example response; never exercised against a live key this
// session (no credential available — see KI-016). Verify field names for
// real before this is wired into a route (CR-084's geo query work, or
// whichever ride/route feature first needs geocoding).
//
// Expected: `{ result?: { items?: [{ full_name?, name?, point?: { lat, lon } }] } }`,
// or `null` for 204 No Content (nothing found). Narrowed field by field
// (CR-137): an item without numeric coordinates is dropped like one with no
// point, a non-list `items` is a malformed answer.
function extractItems(body: unknown): unknown[] {
  const result = isRecord(body) ? body.result : undefined;
  return optionalList(isRecord(result) ? result.items : undefined, 'items');
}

function toGeocodeResult(item: unknown): GeocodeResult | null {
  if (!isRecord(item) || !isRecord(item.point)) return null;
  const { lat, lon } = item.point;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return null;
  const label = [item.full_name, item.name].find(
    (value): value is string => typeof value === 'string',
  );
  return { point: { lat, lng: lon }, label: label ?? '' };
}

export function createGeocodeMethods(
  config: TwoGisProviderConfig,
  breaker: CircuitBreaker,
) {
  const baseUrl = config.geocoderBaseUrl ?? DEFAULT_GEOCODER_BASE_URL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function geocode(query: string): Promise<GeocodeResult[]> {
    const url = new URL(`${baseUrl}/items/geocode`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'items.point,items.full_name');
    url.searchParams.set('key', config.apiKey);

    const body = await fetchJson(
      url.toString(),
      { method: 'GET' },
      timeoutMs,
      breaker,
    );
    return extractItems(body)
      .map(toGeocodeResult)
      .filter((result): result is GeocodeResult => result !== null);
  }

  async function reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const url = new URL(`${baseUrl}/items/geocode`);
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('fields', 'items.point,items.full_name');
    url.searchParams.set('key', config.apiKey);

    const body = await fetchJson(
      url.toString(),
      { method: 'GET' },
      timeoutMs,
      breaker,
    );
    const [first] = extractItems(body);
    return first === undefined ? null : toGeocodeResult(first);
  }

  return { geocode, reverseGeocode };
}
