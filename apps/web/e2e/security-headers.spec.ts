import { expect, test } from '@playwright/test';

// CR-205: `next.config.ts`'s `headers()` — pages carry the web security headers,
// while `/api/v1/*` keeps the API's own helmet set rather than a duplicate.
test('pages are served with the security headers', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);

  const headers = response.headers();
  expect(headers['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('API responses keep only their own helmet headers', async ({
  request,
}) => {
  const response = await request.get('/api/v1/rides');
  expect(response.status()).toBe(200);

  const headers = response.headers();
  // helmet's CSP (`apps/api/src/plugins/security-headers.ts`), not the page one;
  // a duplicated header would arrive comma-joined (`DENY, DENY`).
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-frame-options']).toBe('DENY');
});
