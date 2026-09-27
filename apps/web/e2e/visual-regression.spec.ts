import { expect, test, type Page } from '@playwright/test';
import { ORGANIZER_HEADER_TERMS, ORGANIZER_OVERVIEW_TERMS } from 'ui';
import {
  createOrganizerProfile,
  createPublishedRideAt,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// CR-138. Pixel-diff baselines for the five key screens named in the P2
// backlog item: discovery map, ride card, ride detail page, registration
// (inline on ride detail — there is no separate route/modal, confirmed
// against `RideDetailView.tsx`), and the organizer dashboard. Runs under
// both the `chromium` and `mobile` projects (`playwright.config.ts`).
//
// Determinism, two different problems solved two different ways:
// - Discovery screens run in a shared CI database alongside every other
//   spec's own fixture rides, so an unfiltered `GET /v1/rides` is never
//   stable. `onlyShowThisRide` proxies the real request through
//   (`route.fetch()`) and filters its `items` down to the one ride this
//   test created — real, correctly-shaped API data, but deterministic.
// - The ride-detail and organizer-dashboard screens render several
//   "relative to now" values (a start countdown, an organizer greeting keyed
//   off the hour, a per-day registration chart) computed from the browser's
//   own clock. `page.clock.install` freezes it, paired with a ride created
//   at a fixed absolute `startsAt` rather than an offset from real
//   `Date.now()` (`createPublishedRideAt`'s own reasoning) — otherwise the
//   rendered text would drift depending on what day/hour the suite runs.
// No map tiles to worry about either way: CI never sets
// `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (`.claude/rules/testing.md` "Visual
// regression"), so `RouteMap`/`DiscoveryMap` always render their static
// placeholder here, not a live 2GIS render.
//
// A third, easy-to-miss determinism problem: `registerAndVerify` mints a
// random-UUID email per call, and the shared `AppHeader` renders the signed-
// in viewer's own email as visible text once authenticated. Every screen
// here except the organizer dashboard is public, so discovery/ride-detail
// fixtures are seeded through an isolated `APIRequestContext`
// (`newIsolatedRequest`, never `page.request`) instead — `page` itself stays
// anonymous, and the header shows the fixed "Войти"/"Регистрация" links
// instead of a different email on every run. The organizer dashboard has no
// such option (it requires a session to view at all); its own header
// (`OrganizerHeader`) only ever shows a decorative avatar circle there, not
// the email as text, so that one trigger is `mask`ed instead.

const FIXED_NOW = new Date('2030-01-10T09:00:00.000Z').getTime();
const RIDE_STARTS_AT = '2030-01-15T09:00:00.000Z';

async function onlyShowThisRide(page: Page, rideId: string): Promise<void> {
  await page.route(/\/api\/v1\/rides(\?.*)?$/, async (route) => {
    // `GET /v1/rides` sorts soonest-first (`rides.service.ts`'s
    // `listPublicRides`) and defaults to a page of 20 — on a database that
    // already has other rides (any shared dev DB, or a CI run with several
    // specs' fixtures ahead of this one), our own ride can easily be
    // several pages deep. Raising the requested `limit` to the API's own
    // max (100, `lib/cursor.ts`'s `clampLimit`) is enough to guarantee it's
    // in the response we then filter, without needing a second request.
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '100');
    const response = await route.fetch({ url: url.toString() });
    const body = (await response.json()) as {
      items: Array<{ id: string }>;
    };
    await route.fulfill({
      response,
      json: { ...body, items: body.items.filter((item) => item.id === rideId) },
    });
  });
}

test.describe('discovery screens', () => {
  test.beforeEach(async ({ page }) => {
    const request = await newIsolatedRequest();
    const organizer = await registerAndVerify(request);
    await login(request, organizer.email, organizer.password);
    await createOrganizerProfile(request, 'Клуб e2e: визуальный снимок');
    const { rideId } = await createPublishedRideAt(
      request,
      'Воскресный гравийный заезд',
      RIDE_STARTS_AT,
      { participantLimit: 20 },
    );
    await request.dispose();
    await onlyShowThisRide(page, rideId);
  });

  // The proxying handler's own `route.fetch()` is a real, in-flight network
  // call; leaving it registered past the test's own assertions risks it
  // still running when the page/context tears down (`route.fetch: Test
  // ended`, exactly as Playwright's own error message suggests fixing).
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('discovery grid', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href^="/rides/"]').first()).toBeVisible();
    await expect(page).toHaveScreenshot('discovery-grid.png');
  });

  test('discovery map', async ({ page }) => {
    await page.goto('/?view=map');
    await expect(page.getByTestId('discovery-list-panel')).toBeVisible();
    await expect(page).toHaveScreenshot('discovery-map.png');
  });

  test('ride card', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('a[href^="/rides/"]').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveScreenshot('ride-card.png');
  });
});

test('ride detail page with inline registration', async ({ page }) => {
  await page.clock.install({ time: FIXED_NOW });

  const request = await newIsolatedRequest();
  const organizer = await registerAndVerify(request);
  await login(request, organizer.email, organizer.password);
  await createOrganizerProfile(request, 'Клуб e2e: детали заезда');
  const { rideId } = await createPublishedRideAt(
    request,
    'Детали заезда: визуальный снимок',
    RIDE_STARTS_AT,
    { participantLimit: 20 },
  );
  await request.dispose();

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveScreenshot('ride-detail.png');
});

test('organizer dashboard with one upcoming ride', async ({ page }) => {
  await page.clock.install({ time: FIXED_NOW });

  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: панель организатора');
  await createPublishedRideAt(
    page.request,
    'Панель организатора: визуальный снимок',
    RIDE_STARTS_AT,
    { participantLimit: 20 },
  );

  await page.goto('/organizer');
  await expect(
    page.getByRole('link', { name: ORGANIZER_OVERVIEW_TERMS.sendUpdate }),
  ).toBeVisible();
  const accountTrigger = page.getByRole('button', {
    name: ORGANIZER_HEADER_TERMS.accountMenuLabel,
  });
  await expect(page).toHaveScreenshot('organizer-dashboard.png', {
    mask: [accountTrigger],
  });
});
