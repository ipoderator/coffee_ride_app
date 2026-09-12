import { MapProviderError } from './errors.js';

/**
 * Fetches JSON with an explicit timeout (`.claude/rules/resilience.md` —
 * "never rely on the default/no timeout") and normalizes every failure mode
 * (timeout, network error, non-2xx, unparseable body) into `MapProviderError`
 * so callers never see a raw `fetch`/`AbortError`/driver exception.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
    throw new MapProviderError(
      isTimeout
        ? `2GIS request timed out after ${timeoutMs}ms.`
        : '2GIS request failed.',
      { cause },
    );
  }

  if (!response.ok) {
    // Never surface the raw response body — it may contain provider-internal
    // detail (`.claude/rules/backend.md`'s "never leak ... internals" applies
    // equally to a downstream provider's error body).
    throw new MapProviderError(
      `2GIS responded with status ${response.status}.`,
      {
        status: response.status,
      },
    );
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new MapProviderError('2GIS response body was not valid JSON.', {
      cause,
    });
  }
}
