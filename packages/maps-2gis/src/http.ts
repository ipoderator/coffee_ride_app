import type { CircuitBreaker } from 'resilience';
import { callWithResilience, ResilienceError } from 'resilience';
import { MapProviderError } from './errors.js';

// geocode/reverseGeocode/getRoute are all read-only 2GIS calls (a POST body
// for routing is just a calculation request, no side effect) — safe to
// retry once per `.claude/rules/resilience.md`'s "only for idempotent
// operations".
const MAX_ATTEMPTS = 2;

/**
 * Fetches JSON with an explicit timeout, a bounded retry, and a shared
 * circuit breaker (CR-049's `resilience` package — `.claude/rules/
 * resilience.md`'s "never rely on the default/no timeout" plus "a bounded
 * number of retries" plus "a circuit breaker ... so a degraded provider
 * doesn't cascade"), and normalizes every failure mode (timeout, network
 * error, non-2xx, unparseable body, an open breaker) into `MapProviderError`
 * so callers never see a raw `fetch`/`ResilienceError`/driver exception.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  breaker: CircuitBreaker,
): Promise<unknown> {
  try {
    return await callWithResilience(
      async (signal) => {
        let response: Response;
        try {
          response = await fetch(url, { ...init, signal });
        } catch (cause) {
          throw new MapProviderError('2GIS request failed.', { cause });
        }

        if (!response.ok) {
          // Never surface the raw response body — it may contain
          // provider-internal detail (`.claude/rules/backend.md`'s "never
          // leak ... internals" applies equally to a downstream provider's
          // error body).
          throw new MapProviderError(
            `2GIS responded with status ${response.status}.`,
            { status: response.status },
          );
        }

        try {
          return await response.json();
        } catch (cause) {
          throw new MapProviderError('2GIS response body was not valid JSON.', {
            cause,
          });
        }
      },
      { timeoutMs, retries: { maxAttempts: MAX_ATTEMPTS }, breaker },
    );
  } catch (error) {
    if (!(error instanceof ResilienceError)) throw error;
    if (error.code === 'circuit_open') {
      throw new MapProviderError('2GIS is temporarily unavailable.', {
        cause: error,
      });
    }
    // The last attempt's own `MapProviderError` (non-2xx status, bad JSON,
    // or a plain request failure) carries the most useful detail — surface
    // it directly instead of a generic "retries exhausted" message.
    if (error.cause instanceof MapProviderError) throw error.cause;
    throw new MapProviderError(
      error.code === 'timeout'
        ? `2GIS request timed out after ${timeoutMs}ms.`
        : '2GIS request failed.',
      { cause: error },
    );
  }
}
