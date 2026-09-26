import { expect, test } from '@playwright/test';
import { RIDE_DISCOVERY_ROW_TERMS, RIDE_DISCOVERY_TERMS } from 'ui';

// CR-080: rewritten. The old assertion checked for CR-002's bootstrap
// placeholder copy ("Платформа собирается..."), which `/` stopped rendering
// once CR-024 replaced it with the real discovery screen — that copy no
// longer exists anywhere in the app, so the old spec would have failed the
// moment it was ever actually run. This is a real end-to-end check, not a
// static-content one: it exercises apps/web -> its own /api/v1/* rewrite ->
// a real apps/api -> a real Postgres. It deliberately does not assume the
// database is empty (CI's is; a local dev database that's been used for a
// while usually isn't) — it accepts either the empty state or at least one
// real ride card, proving the round trip actually resolved instead of
// hanging on the loading skeleton or falling into the error state.
// `.claude/rules/testing.md`'s real critical-journey specs (discover+
// register, organizer create+publish, view participants) are tracked
// separately as CR-092, not this smoke check's job.
// CR-133 (KI-067): CR-130's «Заезды/Карта» tabs made the `RideGrid` the
// default view on `/` and mount the map-view list only at `/?view=map`, so
// the spec checks both views instead of waiting for a list that the default
// view never renders.
test('home page loads the default grid view end to end', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: RIDE_DISCOVERY_TERMS.pageTitle,
    }),
  ).toBeVisible();

  const main = page.getByRole('main');
  const emptyState = main.getByText(RIDE_DISCOVERY_TERMS.emptyTitle);
  const rideLink = main.locator('a[href^="/rides/"]').first();
  await expect(emptyState.or(rideLink)).toBeVisible();
});

test('home page loads the map view end to end', async ({ page }) => {
  await page.goto('/?view=map');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: RIDE_DISCOVERY_TERMS.pageTitle,
    }),
  ).toBeVisible();

  const listPanel = page.getByTestId('discovery-list-panel');
  await expect(listPanel).toBeVisible();

  // CR-118: the unfiltered empty state's copy («Топокарта» sheet wording).
  const emptyState = listPanel.getByText(RIDE_DISCOVERY_ROW_TERMS.emptyTitle);
  const rideLink = listPanel.locator('a[href^="/rides/"]').first();
  await expect(emptyState.or(rideLink)).toBeVisible();
});
