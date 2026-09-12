export interface TwoGisProviderConfig {
  /** Server-side Geocoder/Directions key (`MAPS_2GIS_API_KEY`). Never the public MapGL key — CR-071. */
  apiKey: string;
  /** Default: `https://catalog.api.2gis.com/3.0` (Geocoder API). */
  geocoderBaseUrl?: string;
  /** Default: `https://routing.api.2gis.com/routing/7.0.0` (Routing API). */
  routingBaseUrl?: string;
  /** Per-request timeout in milliseconds (`.claude/rules/resilience.md`). Default 5000. */
  timeoutMs?: number;
}

export const DEFAULT_GEOCODER_BASE_URL = 'https://catalog.api.2gis.com/3.0';
export const DEFAULT_ROUTING_BASE_URL =
  'https://routing.api.2gis.com/routing/7.0.0';
export const DEFAULT_TIMEOUT_MS = 5000;
