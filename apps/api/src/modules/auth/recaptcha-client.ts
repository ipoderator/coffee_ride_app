import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';

// CR-261 (ADR-038). The one place apps/api talks to Google reCAPTCHA: the v2
// `siteverify` call that checks a token the browser widget issued. Goes through
// `packages/resilience` with one breaker for the integration
// (`.claude/rules/resilience.md`); `ResilienceError` never leaves this file —
// callers see a verdict, or `RecaptchaUnavailableError` (Google down/slow/odd, or
// the secret itself rejected). The secret and the token are never logged, and
// never part of an error message. Only the token goes to Google — no `remoteip`
// (it is optional): nothing about the person leaves the server (KI-105).
export const RECAPTCHA_VERIFY_URL =
  'https://www.google.com/recaptcha/api/siteverify';

const TIMEOUT_MS = 5000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

export class RecaptchaUnavailableError extends Error {}

/**
 * `invalid`: Google says the token was not solved for this key, malformed, or
 * already spent/expired (`timeout-or-duplicate` — a token is good for one check,
 * within two minutes). The reason stays for the log; the caller answers both the
 * same way.
 */
export type RecaptchaVerdict =
  { ok: true } | { ok: false; reason: 'expired' | 'invalid' };

export interface RecaptchaVerifier {
  verify(token: string): Promise<RecaptchaVerdict>;
}

interface SiteverifyResponse {
  success?: unknown;
  'error-codes'?: unknown;
}

// Errors that mean our secret is wrong — no token a person could re-solve would
// pass, so they are an outage, not a failed challenge. `bad-request` is not one of
// them: a caller can provoke it with a junk token, and it must not turn into a 503
// and a warning per request.
const CONFIGURATION_ERRORS = new Set([
  'missing-input-secret',
  'invalid-input-secret',
]);

export function createRecaptchaVerifier(options: {
  secretKey: string;
  fetchImpl?: typeof fetch;
}): RecaptchaVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  const breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });

  return {
    async verify(token) {
      const form = new URLSearchParams({
        secret: options.secretKey,
        response: token,
      });

      let body: SiteverifyResponse;
      try {
        body = await callWithResilience(
          async (signal) => {
            const response = await fetchImpl(RECAPTCHA_VERIFY_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: form.toString(),
              signal,
            });
            if (!response.ok) {
              throw new RecaptchaUnavailableError(
                `reCAPTCHA siteverify responded with status ${response.status}.`,
              );
            }
            return (await response.json()) as SiteverifyResponse;
          },
          {
            timeoutMs: TIMEOUT_MS,
            // Not idempotent: Google spends the token on the first check, so a
            // retry after a lost response would only ever read
            // `timeout-or-duplicate`.
            retries: { maxAttempts: 1 },
            breaker,
          },
        );
      } catch (error) {
        throw new RecaptchaUnavailableError(
          error instanceof ResilienceError && error.code === 'circuit_open'
            ? 'reCAPTCHA is temporarily unavailable (circuit open).'
            : 'reCAPTCHA siteverify request failed.',
          { cause: error },
        );
      }

      if (body.success === true) return { ok: true };

      const codes = Array.isArray(body['error-codes'])
        ? body['error-codes'].filter((c): c is string => typeof c === 'string')
        : [];
      const misconfigured = codes.find((code) =>
        CONFIGURATION_ERRORS.has(code),
      );
      if (misconfigured) {
        throw new RecaptchaUnavailableError(
          `reCAPTCHA siteverify rejected the request: ${misconfigured}.`,
        );
      }
      return {
        ok: false,
        reason: codes.includes('timeout-or-duplicate') ? 'expired' : 'invalid',
      };
    },
  };
}
