import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';
import type { OAuthIdentity } from './oauth-sign-in.service.js';

// CR-260 (ADR-037). The one place apps/api talks to Yandex ID: a server-side OAuth 2.0
// Authorization Code Flow with PKCE (S256) and `state`, then the profile from the
// Yandex ID API (`login.yandex.ru/info`). Yandex ID is plain OAuth, not OpenID
// Connect — there is no ID token, so the person is whoever the access token's profile
// says, read once over TLS from Yandex itself. Every HTTP call goes through
// `packages/resilience` with one breaker for the integration
// (`.claude/rules/resilience.md`); `ResilienceError` never leaves this file —
// callers see `YandexUnavailableError` (Yandex down/slow) or `YandexRejectedError`
// (a response failed a check). The access token never leaves `completeSignIn` and is
// neither stored nor logged.
//
// Endpoints per yandex.ru/dev/id/doc (authorize/token: «Получение кода
// подтверждения», profile: «Получение информации о пользователе»).
export const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
export const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token';
export const YANDEX_PROFILE_URL = 'https://login.yandex.ru/info?format=json';
export const YANDEX_SCOPES = 'login:info login:email';

const TIMEOUT_MS = 8000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;
// RFC 5321's limit; a longer `default_email` is treated as absent.
const MAX_EMAIL_LENGTH = 254;

export class YandexUnavailableError extends Error {}

/**
 * Yandex or its answers failed a check (a spent code, a PKCE mismatch, a token for
 * another app, a profile without an id) — `detail` names the check for the log only.
 * A declined consent never gets this far: the route reads it from the callback.
 */
export class YandexRejectedError extends Error {
  constructor(public readonly detail: string) {
    super(`Yandex sign-in rejected: ${detail}`);
  }
}

export interface YandexOAuthClient {
  /** The URL the browser is sent to; no network call. */
  authorizationUrl(options: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  /**
   * Exchanges the code (with the PKCE verifier) for an access token, reads the
   * profile with it and returns who the person is. The caller has already matched
   * `state` against the signed transaction cookie.
   */
  completeSignIn(options: {
    code: string;
    codeVerifier: string;
  }): Promise<OAuthIdentity>;
}

/** A non-blank string (trimmed), optionally no longer than `maxLength`. */
function stringField(value: unknown, maxLength?: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return maxLength === undefined || trimmed.length <= maxLength
    ? trimmed
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * The stable account id — a decimal string in Yandex's answer; a number is accepted
 * too, but only one JSON can represent exactly.
 */
function accountIdOf(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{1,64}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

export function createYandexOAuthClient(options: {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): YandexOAuthClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });

  async function call(
    url: string,
    init: RequestInit,
    // The profile read is safe to repeat; the code exchange is not (the code is
    // single-use).
    idempotent: boolean,
  ): Promise<Response> {
    try {
      return await callWithResilience(
        async (signal) => {
          const response = await fetchImpl(url, { ...init, signal });
          if (response.status >= 500 || response.status === 429) {
            throw new YandexUnavailableError(
              `Yandex responded with status ${response.status}.`,
            );
          }
          return response;
        },
        {
          timeoutMs: TIMEOUT_MS,
          retries: { maxAttempts: idempotent ? 2 : 1 },
          breaker,
        },
      );
    } catch (error) {
      // `callWithResilience` reports every failure as a `ResilienceError`.
      throw new YandexUnavailableError(
        error instanceof ResilienceError && error.code === 'circuit_open'
          ? 'Yandex is temporarily unavailable (circuit open).'
          : 'Yandex request failed.',
        { cause: error },
      );
    }
  }

  async function exchangeCode(code: string, codeVerifier: string) {
    const response = await call(
      YANDEX_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          // RFC 6749 §2.3.1: form-encode each half before Basic.
          authorization: `Basic ${Buffer.from(
            `${encodeURIComponent(options.clientId)}:${encodeURIComponent(options.clientSecret)}`,
          ).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
        }).toString(),
      },
      false,
    );
    const body = await readJson(response);
    if (!response.ok) {
      const error = isRecord(body) ? stringField(body.error, 64) : null;
      throw new YandexRejectedError(
        `token endpoint error ${error ?? response.status}`,
      );
    }
    const accessToken = isRecord(body) ? stringField(body.access_token) : null;
    if (!accessToken) {
      throw new YandexRejectedError('no access token in the response');
    }
    return accessToken;
  }

  async function readProfile(accessToken: string): Promise<OAuthIdentity> {
    const response = await call(
      YANDEX_PROFILE_URL,
      {
        method: 'GET',
        headers: {
          authorization: `OAuth ${accessToken}`,
          accept: 'application/json',
        },
      },
      true,
    );
    const body = await readJson(response);
    if (!response.ok) {
      throw new YandexRejectedError(
        `profile endpoint status ${response.status}`,
      );
    }
    if (!isRecord(body)) {
      throw new YandexRejectedError('profile is not an object');
    }
    // The token must be one Yandex issued to this app (it always is — we just
    // exchanged it — but a mismatch would mean someone else's token reached us).
    if (body.client_id !== undefined && body.client_id !== options.clientId) {
      throw new YandexRejectedError('profile client_id mismatch');
    }
    const accountId = accountIdOf(body.id);
    if (!accountId) {
      throw new YandexRejectedError('profile without a usable id');
    }
    const email = stringField(body.default_email, MAX_EMAIL_LENGTH);
    return {
      accountId,
      email,
      // ADR-037: Yandex ID holds only addresses it has confirmed — a Yandex Mail
      // mailbox, or an external address confirmed by code/link before Yandex
      // accepts it — and `login:email` returns the default one of those. The API
      // has no separate «verified» flag, so a present address is a verified one.
      emailVerified: email !== null,
      // Cut to the profile's 60 characters by `signInWithOAuth`.
      givenName: stringField(body.first_name),
      familyName: stringField(body.last_name),
    };
  }

  return {
    authorizationUrl({ redirectUri, state, codeChallenge }) {
      const url = new URL(YANDEX_AUTHORIZE_URL);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId,
        redirect_uri: redirectUri,
        scope: YANDEX_SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },

    async completeSignIn({ code, codeVerifier }) {
      const accessToken = await exchangeCode(code, codeVerifier);
      return readProfile(accessToken);
    },
  };
}
