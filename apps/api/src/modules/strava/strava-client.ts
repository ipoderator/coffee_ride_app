import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';

// CR-234 (ADR-033). The one place apps/api talks to Strava. Every call goes through
// `packages/resilience` with one breaker shared by the whole integration
// (`.claude/rules/resilience.md`); `ResilienceError` never leaves this file — callers
// see `StravaUnavailableError` (Strava down/slow/odd) or `StravaRejectedError` (Strava
// answered and said no: a used/forged code, a revoked token).
const STRAVA_ORIGIN = 'https://www.strava.com';
const TIMEOUT_MS = 8000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;
const ACTIVITIES_PER_PAGE = 30;
// A 2-hour ride logged every second is ~7,000 points; the coverage check needs
// the shape, not every second.
const MAX_TRACK_POINTS = 2000;

export class StravaUnavailableError extends Error {}
export class StravaRejectedError extends Error {}

export interface StravaActivitySummary {
  id: string;
  sportType: string;
  startDate: Date;
  distanceMeters: number;
  // Google encoded polyline of the activity's track; `null` for an activity without
  // GPS (indoor, manual) or one whose map the athlete hides.
  summaryPolyline: string | null;
}

export interface StravaClient {
  /** Builds the URL the participant is sent to; no network call. */
  authorizeUrl(options: { redirectUri: string; state: string }): string;
  /** Single-use code → short-lived access token. Never retried (the code is spent). */
  exchangeCode(code: string): Promise<string>;
  /** The athlete's activities that started inside `[after, before]`. */
  listActivities(
    accessToken: string,
    window: { after: Date; before: Date },
  ): Promise<StravaActivitySummary[]>;
  /**
   * The activity's GPS track from its streams — for an activity whose list entry
   * carries no `summary_polyline` (Strava leaves it empty for some athletes'
   * activities). `null` when Strava has no track for it.
   */
  getActivityTrack(
    accessToken: string,
    activityId: string,
  ): Promise<Array<{ lat: number; lng: number }> | null>;
  /** Revokes the app's access for this athlete, ending the one-shot grant. */
  deauthorize(accessToken: string): Promise<void>;
}

// An HTTP answer from Strava, returned (not thrown) for 4xx so that a refusal is
// neither retried nor counted against the breaker — only transport errors, 5xx and
// 429 (Strava's rate limit) mean "Strava is unavailable".
interface StravaResponse {
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createStravaClient(options: {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): StravaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });

  async function call(
    path: string,
    init: RequestInit,
    { idempotent }: { idempotent: boolean },
  ): Promise<StravaResponse> {
    try {
      return await callWithResilience(
        async (signal) => {
          const response = await fetchImpl(`${STRAVA_ORIGIN}${path}`, {
            ...init,
            signal,
          });
          if (response.status >= 500 || response.status === 429) {
            throw new StravaUnavailableError(
              `Strava responded with status ${response.status}.`,
            );
          }
          const text = await response.text();
          let body: unknown = null;
          if (text) {
            try {
              body = JSON.parse(text);
            } catch {
              throw new StravaUnavailableError(
                'Strava response body was not valid JSON.',
              );
            }
          }
          return { status: response.status, body };
        },
        {
          timeoutMs: TIMEOUT_MS,
          retries: { maxAttempts: idempotent ? 2 : 1 },
          breaker,
        },
      );
    } catch (error) {
      if (error instanceof ResilienceError) {
        throw new StravaUnavailableError(
          error.code === 'circuit_open'
            ? 'Strava is temporarily unavailable (circuit open).'
            : `Strava request failed: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  return {
    authorizeUrl({ redirectUri, state }) {
      const url = new URL('/oauth/authorize', STRAVA_ORIGIN);
      url.searchParams.set('client_id', options.clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('approval_prompt', 'auto');
      url.searchParams.set('scope', 'activity:read');
      url.searchParams.set('state', state);
      return url.toString();
    },

    async exchangeCode(code) {
      const { status, body } = await call(
        '/oauth/token',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code,
            grant_type: 'authorization_code',
          }).toString(),
        },
        { idempotent: false },
      );
      if (status !== 200) {
        throw new StravaRejectedError(
          `Strava refused the authorization code (status ${status}).`,
        );
      }
      if (!isRecord(body) || typeof body.access_token !== 'string') {
        throw new StravaUnavailableError(
          'Strava token response had an unexpected shape.',
        );
      }
      return body.access_token;
    },

    async listActivities(accessToken, window) {
      const query = new URLSearchParams({
        after: String(Math.floor(window.after.getTime() / 1000)),
        before: String(Math.ceil(window.before.getTime() / 1000)),
        per_page: String(ACTIVITIES_PER_PAGE),
      });
      const { status, body } = await call(
        `/api/v3/athlete/activities?${query.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
        { idempotent: true },
      );
      if (status !== 200) {
        throw new StravaRejectedError(
          `Strava refused the activity list (status ${status}).`,
        );
      }
      if (!Array.isArray(body)) {
        throw new StravaUnavailableError(
          'Strava activity list had an unexpected shape.',
        );
      }
      return body.flatMap((item) => {
        const parsed = parseActivity(item);
        return parsed ? [parsed] : [];
      });
    },

    async getActivityTrack(accessToken, activityId) {
      const { status, body } = await call(
        `/api/v3/activities/${encodeURIComponent(activityId)}/streams?keys=latlng&key_by_type=true`,
        { headers: { authorization: `Bearer ${accessToken}` } },
        { idempotent: true },
      );
      if (status !== 200) return null;
      const latlng =
        isRecord(body) && isRecord(body.latlng) ? body.latlng : null;
      if (!latlng || !Array.isArray(latlng.data)) return null;
      const points = latlng.data.flatMap((pair: unknown) =>
        Array.isArray(pair) &&
        typeof pair[0] === 'number' &&
        typeof pair[1] === 'number'
          ? [{ lat: pair[0], lng: pair[1] }]
          : [],
      );
      if (points.length < 2) return null;
      const stride = Math.ceil(points.length / MAX_TRACK_POINTS);
      return stride > 1 ? points.filter((_, i) => i % stride === 0) : points;
    },

    async deauthorize(accessToken) {
      await call(
        '/oauth/deauthorize',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}` },
        },
        { idempotent: true },
      );
    },
  };
}

// A malformed entry is skipped rather than failing the whole list: one odd activity
// must not hide the athlete's real ride.
function parseActivity(item: unknown): StravaActivitySummary | null {
  if (!isRecord(item)) return null;
  const id = item.id;
  const sportType = item.sport_type ?? item.type;
  const startDate =
    typeof item.start_date === 'string' ? new Date(item.start_date) : null;
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    !/^\d+$/.test(String(id)) ||
    typeof sportType !== 'string' ||
    !startDate ||
    Number.isNaN(startDate.getTime())
  ) {
    return null;
  }
  const map = isRecord(item.map) ? item.map : null;
  const polyline =
    map && typeof map.summary_polyline === 'string' && map.summary_polyline
      ? map.summary_polyline
      : null;
  return {
    id: String(id),
    sportType,
    startDate,
    distanceMeters: typeof item.distance === 'number' ? item.distance : 0,
    summaryPolyline: polyline,
  };
}
