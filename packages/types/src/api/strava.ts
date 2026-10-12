// CR-234 (ADR-033): «Синхронизировать со Strava».

// `GET /v1/strava/status` — whether the API has a Strava application configured;
// the web app shows the button only when it does.
export interface StravaStatusResponse {
  available: boolean;
}

// `POST /v1/rides/:id/strava-sync` — where to send the participant's browser.
export interface StartStravaSyncResponse {
  authorizeUrl: string;
}

// The callback redirects back to the ride page with `?strava=<outcome>`.
export const STRAVA_SYNC_OUTCOMES = [
  'verified',
  'no_activity',
  'no_match',
  'denied',
  'unavailable',
  'already_decided',
  'error',
] as const;
export type StravaSyncOutcome = (typeof STRAVA_SYNC_OUTCOMES)[number];
