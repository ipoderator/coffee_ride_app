import type { GeocodeResult, LatLng } from 'maps-core';
import type { TwoGisProviderConfig } from './config.js';
import { DEFAULT_GEOCODER_BASE_URL, DEFAULT_TIMEOUT_MS } from './config.js';
import { fetchJson } from './http.js';

// 2GIS Geocoder API (https://docs.2gis.com/en/api/search/geocoder/overview),
// `GET {geocoderBaseUrl}/items/geocode`. Shape below reflects 2GIS's own
// documented example response; never exercised against a live key this
// session (no credential available — see KI-016). Verify field names for
// real before this is wired into a route (CR-084's geo query work, or
// whichever ride/route feature first needs geocoding).
interface GeocoderResponse {
  result?: {
    items?: Array<{
      full_name?: string;
      name?: string;
      point?: { lat: number; lon: number };
    }>;
  };
}

function toGeocodeResult(item: {
  full_name?: string;
  name?: string;
  point?: { lat: number; lon: number };
}): GeocodeResult | null {
  if (!item.point) return null;
  return {
    point: { lat: item.point.lat, lng: item.point.lon },
    label: item.full_name ?? item.name ?? '',
  };
}

export function createGeocodeMethods(config: TwoGisProviderConfig) {
  const baseUrl = config.geocoderBaseUrl ?? DEFAULT_GEOCODER_BASE_URL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function geocode(query: string): Promise<GeocodeResult[]> {
    const url = new URL(`${baseUrl}/items/geocode`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'items.point,items.full_name');
    url.searchParams.set('key', config.apiKey);

    const body = (await fetchJson(
      url.toString(),
      { method: 'GET' },
      timeoutMs,
    )) as GeocoderResponse;
    const items = body.result?.items ?? [];
    return items
      .map(toGeocodeResult)
      .filter((result): result is GeocodeResult => result !== null);
  }

  async function reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const url = new URL(`${baseUrl}/items/geocode`);
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('fields', 'items.point,items.full_name');
    url.searchParams.set('key', config.apiKey);

    const body = (await fetchJson(
      url.toString(),
      { method: 'GET' },
      timeoutMs,
    )) as GeocoderResponse;
    const [first] = body.result?.items ?? [];
    return first ? toGeocodeResult(first) : null;
  }

  return { geocode, reverseGeocode };
}
