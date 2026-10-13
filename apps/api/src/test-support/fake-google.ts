import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { GOOGLE_ISSUER } from '../modules/auth/google-client.js';

// CR-247: an in-process stand-in for Google's token endpoint and JWKS, plugged into
// `createGoogleOidcClient({ fetchImpl })`. It plays Google's side of the code flow
// for real — checks the client credentials, `redirect_uri` and the PKCE verifier
// against the challenge, spends each code once — and signs RS256 ID tokens, so
// openid-client's own validation (signature, iss, aud, exp, nonce) runs unmodified.

export const FAKE_GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
export const FAKE_GOOGLE_CLIENT_SECRET = 'test-google-client-secret';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

export interface FakeGoogleUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
}

// Per-code knobs a test turns to make Google (or its ID token) misbehave.
export interface IssueOptions {
  idToken?: {
    nonce?: string;
    aud?: string;
    iss?: string;
    expiresInSeconds?: number;
    signWithForeignKey?: boolean;
    omit?: boolean;
  };
  tokenEndpoint?: 'invalid_grant' | 'unavailable';
}

interface PendingCode {
  user: FakeGoogleUser;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  options: IssueOptions;
  used: boolean;
}

function newKey(): { privateKey: KeyObject; jwk: Record<string, unknown> } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privateKey,
    jwk: {
      ...publicKey.export({ format: 'jwk' }),
      kid: randomBytes(6).toString('hex'),
      alg: 'RS256',
      use: 'sig',
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createFakeGoogle() {
  const key = newKey();
  const foreignKey = newKey();
  const codes = new Map<string, PendingCode>();
  const requests: Array<{ url: string; method: string }> = [];

  function signIdToken(
    claims: Record<string, unknown>,
    signer: { privateKey: KeyObject; jwk: Record<string, unknown> },
  ): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: key.jwk.kid, typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = sign(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      signer.privateKey,
    ).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  async function handleToken(init: RequestInit | undefined): Promise<Response> {
    const form = new URLSearchParams(String(init?.body ?? ''));
    const basic = new Headers(init?.headers).get('authorization');
    const credentials = basic?.startsWith('Basic ')
      ? Buffer.from(basic.slice(6), 'base64')
          .toString('utf8')
          .split(':')
          .map(decodeURIComponent)
      : [form.get('client_id'), form.get('client_secret')];
    if (
      credentials[0] !== FAKE_GOOGLE_CLIENT_ID ||
      credentials[1] !== FAKE_GOOGLE_CLIENT_SECRET
    ) {
      return json(401, { error: 'invalid_client' });
    }

    const pending = codes.get(form.get('code') ?? '');
    if (pending?.options.tokenEndpoint === 'unavailable') {
      return json(503, { error: 'temporarily_unavailable' });
    }
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (
      !pending ||
      pending.used ||
      pending.options.tokenEndpoint === 'invalid_grant' ||
      form.get('grant_type') !== 'authorization_code' ||
      form.get('redirect_uri') !== pending.redirectUri ||
      challenge !== pending.codeChallenge
    ) {
      return json(400, { error: 'invalid_grant' });
    }
    pending.used = true;

    const now = Math.floor(Date.now() / 1000);
    const idTokenOptions = pending.options.idToken ?? {};
    const body: Record<string, unknown> = {
      access_token: `ya29.${randomBytes(16).toString('hex')}`,
      token_type: 'Bearer',
      expires_in: 3599,
      scope: 'openid email profile',
    };
    if (!idTokenOptions.omit) {
      body.id_token = signIdToken(
        {
          iss: idTokenOptions.iss ?? GOOGLE_ISSUER,
          aud: idTokenOptions.aud ?? FAKE_GOOGLE_CLIENT_ID,
          azp: FAKE_GOOGLE_CLIENT_ID,
          iat: now,
          exp: now + (idTokenOptions.expiresInSeconds ?? 3600),
          nonce: idTokenOptions.nonce ?? pending.nonce,
          ...pending.user,
        },
        idTokenOptions.signWithForeignKey ? foreignKey : key,
      );
    }
    return json(200, body);
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url === TOKEN_ENDPOINT) return handleToken(init);
    if (url === JWKS_URI) return json(200, { keys: [key.jwk] });
    return json(404, { error: 'not_found' });
  };

  return {
    fetchImpl,
    requests,
    /**
     * Plays the consent screen: reads what `GET /v1/auth/google` put in Google's
     * authorization URL and returns the query Google would send back.
     */
    consent(
      authorizationUrl: string,
      user: FakeGoogleUser,
      options: IssueOptions = {},
    ): URLSearchParams {
      const params = new URL(authorizationUrl).searchParams;
      const code = randomBytes(12).toString('hex');
      codes.set(code, {
        user,
        nonce: params.get('nonce') ?? '',
        codeChallenge: params.get('code_challenge') ?? '',
        redirectUri: params.get('redirect_uri') ?? '',
        options,
        used: false,
      });
      return new URLSearchParams({
        code,
        state: params.get('state') ?? '',
        scope: 'email profile openid',
        authuser: '0',
        prompt: 'consent',
      });
    },
  };
}
