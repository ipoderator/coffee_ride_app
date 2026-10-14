import { describe, expect, it, vi } from 'vitest';
import {
  createRecaptchaVerifier,
  RECAPTCHA_VERIFY_URL,
  RecaptchaUnavailableError,
} from './recaptcha-client.js';

// CR-261 (ADR-038): the siteverify client on its own — the request it sends, the
// verdicts it reads out of Google's answer, and its resilience (timeout, no retry,
// breaker) per `.claude/rules/resilience.md`.

const SECRET = 'a-test-only-recaptcha-secret';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function verifierAnswering(answer: () => Promise<Response> | Response) {
  const fetchImpl = vi.fn<typeof fetch>(async () => answer());
  return {
    fetchImpl,
    verifier: createRecaptchaVerifier({ secretKey: SECRET, fetchImpl }),
  };
}

describe('createRecaptchaVerifier', () => {
  it('posts the secret, token and client IP form-encoded to siteverify', async () => {
    const { fetchImpl, verifier } = verifierAnswering(() =>
      jsonResponse({ success: true, hostname: 'coffeeride.site' }),
    );

    await expect(verifier.verify('a-token', '203.0.113.7')).resolves.toEqual({
      ok: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(RECAPTCHA_VERIFY_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('secret')).toBe(SECRET);
    expect(form.get('response')).toBe('a-token');
    expect(form.get('remoteip')).toBe('203.0.113.7');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves remoteip out when the caller has none', async () => {
    const { fetchImpl, verifier } = verifierAnswering(() =>
      jsonResponse({ success: true }),
    );
    await verifier.verify('a-token');
    const form = new URLSearchParams(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(form.has('remoteip')).toBe(false);
  });

  it('reads a spent or expired token as expired', async () => {
    const { verifier } = verifierAnswering(() =>
      jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    await expect(verifier.verify('old-token')).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it.each([
    [{ success: false, 'error-codes': ['invalid-input-response'] }],
    [{ success: false, 'error-codes': ['missing-input-response'] }],
    [{ success: false, 'error-codes': ['bad-request'] }],
    [{ success: false }],
    [{ success: 'true' }],
    [{ success: false, 'error-codes': 'invalid-input-response' }],
  ])('reads %j as an invalid token', async (body) => {
    const { verifier } = verifierAnswering(() => jsonResponse(body));
    await expect(verifier.verify('bad-token')).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it.each(['invalid-input-secret', 'missing-input-secret'])(
    'treats %s (our configuration, not the person) as unavailable, without the secret in the error',
    async (code) => {
      const { verifier } = verifierAnswering(() =>
        jsonResponse({ success: false, 'error-codes': [code] }),
      );
      const error = await verifier.verify('a-token').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RecaptchaUnavailableError);
      expect((error as Error).message).toContain(code);
      expect((error as Error).message).not.toContain(SECRET);
    },
  );

  it.each([500, 503, 429, 404])(
    'treats an HTTP %i from Google as unavailable',
    async (status) => {
      const { verifier } = verifierAnswering(() =>
        jsonResponse({ success: true }, status),
      );
      await expect(verifier.verify('a-token')).rejects.toBeInstanceOf(
        RecaptchaUnavailableError,
      );
    },
  );

  it('treats a network failure as unavailable and never retries the spent token', async () => {
    const { fetchImpl, verifier } = verifierAnswering(() => {
      throw new TypeError('fetch failed');
    });
    await expect(verifier.verify('a-token')).rejects.toBeInstanceOf(
      RecaptchaUnavailableError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a body that is not JSON as unavailable', async () => {
    const { verifier } = verifierAnswering(
      () => new Response('<html>oops</html>', { status: 200 }),
    );
    await expect(verifier.verify('a-token')).rejects.toBeInstanceOf(
      RecaptchaUnavailableError,
    );
  });

  // `callWithResilience` bounds the call with `AbortSignal.timeout`, which a real
  // `fetch` turns into a `TimeoutError` rejection — what this fake does at once.
  it('treats a timed-out siteverify call as unavailable', async () => {
    const { verifier } = verifierAnswering(() => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const error = await verifier.verify('a-token').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecaptchaUnavailableError);
    expect((error as Error).cause).toMatchObject({ code: 'timeout' });
  });

  it('opens its breaker after repeated failures and stops calling Google', async () => {
    const { fetchImpl, verifier } = verifierAnswering(() =>
      jsonResponse({}, 503),
    );
    for (let i = 0; i < 5; i++) {
      await expect(verifier.verify('a-token')).rejects.toBeInstanceOf(
        RecaptchaUnavailableError,
      );
    }
    const error = await verifier.verify('a-token').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecaptchaUnavailableError);
    expect((error as Error).message).toMatch(/circuit open/);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
