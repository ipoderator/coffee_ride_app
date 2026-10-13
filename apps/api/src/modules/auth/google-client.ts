import * as oidc from 'openid-client';
import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';

// CR-247 (ADR-034). The one place apps/api talks to Google: a server-side OpenID
// Connect Authorization Code Flow with PKCE through `openid-client`. Every HTTP call
// (the token endpoint, Google's JWKS) goes through `packages/resilience` with one
// breaker for the integration (`.claude/rules/resilience.md`); `ResilienceError`
// never leaves this file — callers see `GoogleUnavailableError` (Google down/slow) or
// `GoogleRejectedError` (the response or the ID token failed a check).
//
// Google's provider metadata is fixed here rather than discovered at runtime: these
// endpoints are documented as stable (developers.google.com/identity/openid-connect),
// and a static configuration keeps sign-in from depending on one more network call.
export const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_METADATA: oidc.ServerMetadata = {
  issuer: GOOGLE_ISSUER,
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  id_token_signing_alg_values_supported: ['RS256'],
  code_challenge_methods_supported: ['S256'],
};
export const GOOGLE_SCOPES = 'openid email profile';

const TIMEOUT_MS = 8000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

export class GoogleUnavailableError extends Error {}

/**
 * `cancelled`: the user declined on Google's consent screen. `rejected`: anything
 * else Google or the ID token got wrong (a spent code, a nonce/audience/issuer/
 * signature mismatch, no ID token) — `detail` names the check for the log only.
 */
export class GoogleRejectedError extends Error {
  constructor(
    public readonly reason: 'cancelled' | 'rejected',
    public readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(`Google sign-in ${reason}: ${detail}`, options);
  }
}

/** What the validated ID token says about the person; nothing else is kept. */
export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

export interface GoogleOidcClient {
  /** The URL the browser is sent to; no network call. */
  authorizationUrl(options: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  /**
   * Validates the authorization response against `expectedState`, exchanges the
   * code (with the PKCE verifier) and validates the ID token: signature against
   * Google's JWKS, `iss`, `aud`, `exp`/`iat` and `nonce`. The tokens themselves stay
   * inside this call.
   */
  completeSignIn(options: {
    callbackUrl: URL;
    expectedState: string;
    expectedNonce: string;
    codeVerifier: string;
  }): Promise<GoogleIdentity>;
}

function stringClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function createGoogleOidcClient(options: {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): GoogleOidcClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });

  const config = new oidc.Configuration(
    GOOGLE_METADATA,
    options.clientId,
    options.clientSecret,
  );
  // Also verify the ID token's JWS signature against Google's keys (fetched and
  // cached by openid-client), not only its claims.
  oidc.enableNonRepudiationChecks(config);
  config[oidc.customFetch] = async (url, init) => {
    try {
      return await callWithResilience(
        async (signal) => {
          const response = await fetchImpl(url, {
            ...init,
            signal: init.signal
              ? AbortSignal.any([init.signal, signal])
              : signal,
          } as RequestInit);
          if (response.status >= 500 || response.status === 429) {
            throw new GoogleUnavailableError(
              `Google responded with status ${response.status}.`,
            );
          }
          return response;
        },
        {
          timeoutMs: TIMEOUT_MS,
          // The JWKS read is safe to repeat; the code exchange is not (the code
          // is single-use).
          retries: { maxAttempts: init.method === 'GET' ? 2 : 1 },
          breaker,
        },
      );
    } catch (error) {
      if (error instanceof ResilienceError) {
        throw new GoogleUnavailableError(
          error.code === 'circuit_open'
            ? 'Google is temporarily unavailable (circuit open).'
            : `Google request failed: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  };

  return {
    authorizationUrl({ redirectUri, state, nonce, codeChallenge }) {
      return oidc
        .buildAuthorizationUrl(config, {
          redirect_uri: redirectUri,
          scope: GOOGLE_SCOPES,
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        })
        .toString();
    },

    async completeSignIn({
      callbackUrl,
      expectedState,
      expectedNonce,
      codeVerifier,
    }) {
      let claims: oidc.IDToken | undefined;
      try {
        const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
          expectedState,
          expectedNonce,
          pkceCodeVerifier: codeVerifier,
          idTokenExpected: true,
        });
        claims = tokens.claims();
      } catch (error) {
        if (error instanceof GoogleUnavailableError) throw error;
        if (error instanceof oidc.AuthorizationResponseError) {
          throw new GoogleRejectedError(
            error.error === 'access_denied' ? 'cancelled' : 'rejected',
            `authorization response error ${error.error}`,
            { cause: error },
          );
        }
        if (error instanceof oidc.ResponseBodyError) {
          throw new GoogleRejectedError(
            'rejected',
            `token endpoint error ${error.error}`,
            { cause: error },
          );
        }
        if (error instanceof oidc.ClientError) {
          throw new GoogleRejectedError(
            'rejected',
            `${error.code ?? 'client error'}: ${error.message}`,
            { cause: error },
          );
        }
        throw error;
      }
      if (!claims) {
        throw new GoogleRejectedError(
          'rejected',
          'no ID token in the response',
        );
      }
      // `email_verified` is a JSON boolean in Google's ID tokens; tolerate the
      // string form some older Google tokens carried.
      const emailVerified =
        claims.email_verified === true || claims.email_verified === 'true';
      return {
        sub: claims.sub,
        email: stringClaim(claims.email),
        emailVerified,
        givenName: stringClaim(claims.given_name),
        familyName: stringClaim(claims.family_name),
      };
    },
  };
}
