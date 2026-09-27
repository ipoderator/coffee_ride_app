import { expect, test, type Page } from '@playwright/test';
import { RIDE_CREATE_TERMS, RIDE_DISCOVERY_TERMS, UI_TERMS } from 'ui';
import { mockApiError } from './helpers/mock';

// CR-138. `RideGrid`'s three non-happy-path states — filtered vs. unfiltered
// empty state, and the API-error state — mocked via `page.route` so they're
// deterministic regardless of what a shared local dev database happens to
// hold (`home.spec.ts`'s own real-data assertions stay tolerant of that for
// the same reason; this spec sidesteps it instead of adding to it).

async function mockRideList(page: Page) {
  // A regex, not a glob: Playwright's glob `?` means "any one character", not
  // a literal query-string marker, so it can't express "with or without a
  // query string" on its own.
  await page.route(/\/api\/v1\/rides(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
}

test('discovery shows the unfiltered empty state', async ({ page }) => {
  await mockRideList(page);
  await page.goto('/');

  await expect(page.getByText(RIDE_DISCOVERY_TERMS.emptyTitle)).toBeVisible();
  await expect(
    page.getByText(RIDE_DISCOVERY_TERMS.emptyDescription),
  ).toBeVisible();
});

test('filtering to no matches shows the filtered empty state with a reset action', async ({
  page,
}) => {
  await mockRideList(page);
  await page.goto('/');
  await expect(page.getByText(RIDE_DISCOVERY_TERMS.emptyTitle)).toBeVisible();

  // index 0 is the "all types" option (`filterAllOption`) — any other index
  // is a real `BicycleType`, which is all this test needs to trigger the
  // filtered (as opposed to unfiltered) empty state.
  await page
    .getByLabel(RIDE_CREATE_TERMS.bicycleTypeLabel)
    .selectOption({ index: 1 });

  await expect(
    page.getByText(RIDE_DISCOVERY_TERMS.emptyFilteredTitle),
  ).toBeVisible();

  await page
    .getByRole('button', { name: RIDE_DISCOVERY_TERMS.resetFiltersLabel })
    .click();
  await expect(page.getByText(RIDE_DISCOVERY_TERMS.emptyTitle)).toBeVisible();
});

test('an API failure shows the error state and recovers on retry', async ({
  page,
}) => {
  await mockApiError(page, '**/api/v1/rides**', 500, 'internal_error');
  await page.goto('/');

  // Scoped to `main`: Next.js's own route announcer (`__next-route-announcer__`)
  // also carries `role="alert"`, so an unscoped `getByRole('alert')` is a
  // strict-mode violation the moment both are in the DOM.
  const errorAlert = page.getByRole('main').getByRole('alert');
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).toContainText(RIDE_DISCOVERY_TERMS.loadError);

  await page.unroute('**/api/v1/rides**');
  await page.getByRole('button', { name: UI_TERMS.retry }).click();

  await expect(errorAlert).toBeHidden();
  const main = page.getByRole('main');
  const emptyState = main.getByText(RIDE_DISCOVERY_TERMS.emptyTitle);
  const rideLink = main.locator('a[href^="/rides/"]').first();
  await expect(emptyState.or(rideLink)).toBeVisible();
});
