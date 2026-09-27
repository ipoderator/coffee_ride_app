import type { Page } from '@playwright/test';

// CR-138. First use of route interception in this repo — every other spec
// drives a real API/DB stack (`api-fixtures.ts`), which is the right default,
// but some states (a 500 from the ride list, a storage-unavailable code from
// an upload endpoint) aren't practical to provoke from a real backend on
// demand. This is the one shared pattern for that, instead of each new spec
// rolling its own `page.route` call with a different shape.

/**
 * Intercepts every request matching `urlPattern` and answers with a fixed
 * RFC 9457 problem response, matching the shape `apps/api` actually returns
 * (`.claude/rules/backend.md`) so a component's `ApiError` parsing path is
 * exercised the same way it would be against the real API.
 */
export async function mockApiError(
  page: Page,
  urlPattern: string | RegExp,
  status: number,
  code: string,
  detail = 'Mocked for e2e.',
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: code,
        status,
        code,
        detail,
        instance: route.request().url(),
      }),
    }),
  );
}
