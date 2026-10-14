import { createHash, randomBytes } from 'node:crypto';
import {
  YANDEX_PROFILE_URL,
  YANDEX_TOKEN_URL,
} from '../modules/auth/yandex-client.js';

// CR-260: an in-process stand-in for Yandex ID's token endpoint and profile API,
// plugged into `createYandexOAuthClient({ fetchImpl })`. It plays Yandex's side of
// the code flow for real — checks the Basic client credentials and the PKCE verifier
// against the challenge, spends each code once, answers the profile only for an
// access token it issued.

export const FAKE_YANDEX_CLIENT_ID = 'test-yandex-client-id';
export const FAKE_YANDEX_CLIENT_SECRET = 'test-yandex-client-secret';
/** Every access token the fake issues starts with this (to search for leaks). */
export const FAKE_YANDEX_TOKEN_PREFIX = 'y0_fake';

export interface FakeYandexUser {
  id: string | number;
  login?: string;
  default_email?: string | null;
  first_name?: string;
  last_name?: string;
}

// Per-code knobs a test turns to make Yandex misbehave.
export interface YandexIssueOptions {
  tokenEndpoint?: 'invalid_grant' | 'unavailable' | 'no_access_token';
  profile?:
    'unauthorized' | 'unavailable' | 'not_json' | 'array' | 'foreign_client';
}

interface PendingCode {
  user: FakeYandexUser;
  codeChallenge: string;
  options: YandexIssueOptions;
  used: boolean;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createFakeYandex() {
  const codes = new Map<string, PendingCode>();
  const tokens = new Map<string, PendingCode>();
  const requests: Array<{ url: string; method: string }> = [];
  // Outages a resilience test switches on: the network is gone, or the profile
  // endpoint answers 503 this many more times.
  const outage = { network: false, profile503: 0 };

  function handleToken(init: RequestInit | undefined): Response {
    const form = new URLSearchParams(String(init?.body ?? ''));
    const basic = new Headers(init?.headers).get('authorization');
    const credentials = basic?.startsWith('Basic ')
      ? Buffer.from(basic.slice(6), 'base64')
          .toString('utf8')
          .split(':')
          .map(decodeURIComponent)
      : [];
    if (
      credentials[0] !== FAKE_YANDEX_CLIENT_ID ||
      credentials[1] !== FAKE_YANDEX_CLIENT_SECRET
    ) {
      return json(401, { error: 'invalid_client' });
    }
    const pending = codes.get(form.get('code') ?? '');
    if (pending?.options.tokenEndpoint === 'unavailable') {
      return json(503, { error: 'temporarily_unavailable' });
    }
    const challenge = createHash('sha256')
      .update(form.get('code_verifier') ?? '')
      .digest('base64url');
    if (
      !pending ||
      pending.used ||
      pending.options.tokenEndpoint === 'invalid_grant' ||
      form.get('grant_type') !== 'authorization_code' ||
      challenge !== pending.codeChallenge
    ) {
      return json(400, {
        error: 'invalid_grant',
        error_description: 'Code has expired',
      });
    }
    pending.used = true;
    if (pending.options.tokenEndpoint === 'no_access_token') {
      return json(200, { token_type: 'bearer' });
    }
    const accessToken = `${FAKE_YANDEX_TOKEN_PREFIX}${randomBytes(16).toString('hex')}`;
    tokens.set(accessToken, pending);
    return json(200, {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 31_536_000,
      refresh_token: `1:fake-refresh:${randomBytes(8).toString('hex')}`,
    });
  }

  function handleProfile(init: RequestInit | undefined): Response {
    const header = new Headers(init?.headers).get('authorization') ?? '';
    const pending = header.startsWith('OAuth ')
      ? tokens.get(header.slice(6))
      : undefined;
    if (!pending) return json(401, { error: 'invalid_token' });
    if (outage.profile503 > 0) {
      outage.profile503 -= 1;
      return json(503, { error: 'backend_error' });
    }
    switch (pending.options.profile) {
      case 'unauthorized':
        return json(401, { error: 'invalid_token' });
      case 'unavailable':
        return json(503, { error: 'backend_error' });
      case 'not_json':
        return new Response('<html>oops</html>', { status: 200 });
      case 'array':
        return json(200, [pending.user]);
      default:
        break;
    }
    const { user } = pending;
    const email = user.default_email;
    return json(200, {
      id: user.id,
      login: user.login ?? 'rider',
      client_id:
        pending.options.profile === 'foreign_client'
          ? 'someone-else'
          : FAKE_YANDEX_CLIENT_ID,
      psuid: `1.AA${randomBytes(6).toString('hex')}`,
      ...(email === undefined
        ? {}
        : { default_email: email, emails: email ? [email] : [] }),
      first_name: user.first_name,
      last_name: user.last_name,
      display_name: user.login ?? 'rider',
    });
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (outage.network) throw new TypeError('fetch failed');
    if (url === YANDEX_TOKEN_URL) return handleToken(init);
    if (url === YANDEX_PROFILE_URL) return handleProfile(init);
    return json(404, { error: 'not_found' });
  };

  return {
    fetchImpl,
    requests,
    outage,
    /**
     * Plays the consent screen: reads what `GET /v1/auth/yandex` put in the
     * authorization URL and returns the query Yandex would send back.
     */
    consent(
      authorizationUrl: string,
      user: FakeYandexUser,
      options: YandexIssueOptions = {},
    ): URLSearchParams {
      const params = new URL(authorizationUrl).searchParams;
      const code = randomBytes(8).toString('hex');
      codes.set(code, {
        user,
        codeChallenge: params.get('code_challenge') ?? '',
        options,
        used: false,
      });
      return new URLSearchParams({
        code,
        state: params.get('state') ?? '',
        cid: randomBytes(6).toString('hex'),
      });
    },
    /** The query Yandex sends back when the person presses «Отмена». */
    decline(authorizationUrl: string): URLSearchParams {
      return new URLSearchParams({
        error: 'access_denied',
        error_description: 'access denied',
        state: new URL(authorizationUrl).searchParams.get('state') ?? '',
      });
    },
  };
}
