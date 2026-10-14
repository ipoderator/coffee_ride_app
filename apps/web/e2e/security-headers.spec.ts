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

// ADR-036 (KI-097): the script CSP is a per-request nonce, and Next stamps that
// same nonce on every script of the page it renders.
test('every page render gets its own script nonce', async ({ request }) => {
  const nonceOf = (policy: string | undefined) =>
    /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

  const first = await request.get('/');
  const policy = first.headers()['content-security-policy'];
  const nonce = nonceOf(policy);
  expect(nonce).toBeTruthy();
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  const html = await first.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) {
    expect(tag).toContain(`nonce="${nonce}"`);
  }

  const second = await request.get('/');
  expect(nonceOf(second.headers()['content-security-policy'])).not.toBe(nonce);
});

test('pages run under the CSP without a single violation', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { cspViolations: string[] }).cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  for (const path of ['/', '/login']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // The nonce'd theme init script ran: no stored choice means dark.
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(
      await page.evaluate(
        () => (window as unknown as { cspViolations: string[] }).cspViolations,
      ),
    ).toEqual([]);
  }
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
