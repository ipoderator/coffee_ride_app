import { describe, expect, it } from 'vitest';
import {
  createFakeYandex,
  FAKE_YANDEX_CLIENT_ID,
  FAKE_YANDEX_CLIENT_SECRET,
  type FakeYandexUser,
  type YandexIssueOptions,
} from '../../test-support/fake-yandex.js';
import { newOAuthTransaction } from './oauth-transaction.js';
import {
  createYandexOAuthClient,
  YANDEX_PROFILE_URL,
  YANDEX_TOKEN_URL,
  YandexRejectedError,
  YandexUnavailableError,
} from './yandex-client.js';

// CR-260 (ADR-037): the Yandex ID client against `test-support/fake-yandex.ts`.

const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/yandex/callback';
const USER: FakeYandexUser = {
  id: '1130000012345678',
  default_email: 'rider@yandex.ru',
  first_name: 'Анна',
  last_name: 'Велосипедова',
};

function setup(clientSecret = FAKE_YANDEX_CLIENT_SECRET) {
  const yandex = createFakeYandex();
  const client = createYandexOAuthClient({
    clientId: FAKE_YANDEX_CLIENT_ID,
    clientSecret,
    fetchImpl: yandex.fetchImpl,
  });

  /** Authorization URL → consent → `completeSignIn`, as the routes run it. */
  async function signIn(
    user: FakeYandexUser = USER,
    options?: YandexIssueOptions,
    verifierOverride?: string,
  ) {
    const { transaction, codeChallenge } = newOAuthTransaction(null);
    const url = client.authorizationUrl({
      redirectUri: REDIRECT_URI,
      state: transaction.state,
      codeChallenge,
    });
    const query = yandex.consent(url, user, options);
    return client.completeSignIn({
      code: query.get('code')!,
      codeVerifier: verifierOverride ?? transaction.codeVerifier,
    });
  }

  return { yandex, client, signIn };
}

describe('createYandexOAuthClient', () => {
  it('builds the authorization URL with PKCE S256, state and the two rights', () => {
    const { client } = setup();
    const url = new URL(
      client.authorizationUrl({
        redirectUri: REDIRECT_URI,
        state: 'the-state',
        codeChallenge: 'the-challenge',
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://oauth.yandex.ru/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: FAKE_YANDEX_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'login:info login:email',
      state: 'the-state',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
    });
    expect(url.toString()).not.toContain(FAKE_YANDEX_CLIENT_SECRET);
  });

  it('exchanges the code and returns the profile, a present email as verified', async () => {
    const { yandex, signIn } = setup();
    await expect(signIn()).resolves.toEqual({
      accountId: '1130000012345678',
      email: 'rider@yandex.ru',
      emailVerified: true,
      givenName: 'Анна',
      familyName: 'Велосипедова',
    });
    expect(yandex.requests).toEqual([
      { url: YANDEX_TOKEN_URL, method: 'POST' },
      { url: YANDEX_PROFILE_URL, method: 'GET' },
    ]);
  });

  it('accepts a numeric id and treats blank or missing fields as absent', async () => {
    const { signIn } = setup();
    await expect(
      signIn({ id: 42, default_email: '  ', first_name: ' ', last_name: '' }),
    ).resolves.toEqual({
      accountId: '42',
      email: null,
      emailVerified: false,
      givenName: null,
      familyName: null,
    });
    await expect(signIn({ id: '7' })).resolves.toMatchObject({
      email: null,
      emailVerified: false,
    });
  });

  it.each<[string, FakeYandexUser]>([
    ['no id', { id: '' }],
    ['a non-numeric id', { id: 'abc' }],
    ['a fractional id', { id: 1.5 }],
  ])('rejects a profile with %s', async (_label, user) => {
    const { signIn } = setup();
    await expect(signIn(user)).rejects.toBeInstanceOf(YandexRejectedError);
  });

  it.each<[string, YandexIssueOptions]>([
    ['a refused code', { tokenEndpoint: 'invalid_grant' }],
    ['a token response without a token', { tokenEndpoint: 'no_access_token' }],
    ['a refused access token', { profile: 'unauthorized' }],
    ['a profile that is not JSON', { profile: 'not_json' }],
    ['a profile that is not an object', { profile: 'array' }],
    ['a token issued to another app', { profile: 'foreign_client' }],
  ])('rejects %s', async (_label, options) => {
    const { signIn } = setup();
    await expect(signIn(USER, options)).rejects.toBeInstanceOf(
      YandexRejectedError,
    );
  });

  it('rejects a wrong PKCE verifier and wrong client credentials', async () => {
    await expect(
      setup().signIn(USER, {}, 'not-the-verifier'),
    ).rejects.toMatchObject({ detail: 'token endpoint error invalid_grant' });
    await expect(setup('wrong-secret').signIn()).rejects.toMatchObject({
      detail: 'token endpoint error invalid_client',
    });
  });

  it('maps a 5xx and a dead network to unavailable, never retrying the code exchange', async () => {
    const { yandex, signIn } = setup();
    await expect(
      signIn(USER, { tokenEndpoint: 'unavailable' }),
    ).rejects.toBeInstanceOf(YandexUnavailableError);
    await expect(
      signIn(USER, { profile: 'unavailable' }),
    ).rejects.toBeInstanceOf(YandexUnavailableError);

    yandex.requests.length = 0;
    yandex.outage.network = true;
    await expect(signIn()).rejects.toBeInstanceOf(YandexUnavailableError);
    expect(yandex.requests).toEqual([
      { url: YANDEX_TOKEN_URL, method: 'POST' },
    ]);
  });

  it('retries the profile read once', async () => {
    const { yandex, signIn } = setup();
    yandex.outage.profile503 = 1;
    await expect(signIn()).resolves.toMatchObject({
      accountId: '1130000012345678',
    });
    expect(
      yandex.requests.filter((r) => r.url === YANDEX_PROFILE_URL),
    ).toHaveLength(2);
  });

  it('opens its circuit after repeated failures and stops calling Yandex', async () => {
    const { yandex, signIn } = setup();
    yandex.outage.network = true;
    for (let i = 0; i < 5; i += 1) {
      await expect(signIn()).rejects.toBeInstanceOf(YandexUnavailableError);
    }
    const before = yandex.requests.length;
    await expect(signIn()).rejects.toThrow(/circuit open/);
    expect(yandex.requests).toHaveLength(before);
  });
});
