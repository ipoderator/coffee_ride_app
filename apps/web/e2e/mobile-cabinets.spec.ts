import { expect, test } from '@playwright/test';
import {
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';

// CR-138. Runs under both the `chromium` (desktop) and `mobile` (iPhone 13,
// ~390px) Playwright projects (`playwright.config.ts`'s `testMatch`) so one
// spec exercises both sides of each cabinet's responsive breakpoint instead
// of hard-coding a viewport here — `docs/design.md` §11's `lg` (1024, the
// organizer sidebar/`CabinetSectionTabs` switch) and `md` (768, the
// participant hamburger/`BottomTabBar` switch).

test('organizer cabinet switches between the sidebar and section tabs at `lg`', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: адаптивность');

  await page.goto('/organizer');
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;

  const sidebar = page.locator('aside');
  const sectionTabs = page.locator('nav.lg\\:hidden');

  if (isDesktop) {
    await expect(sidebar).toBeVisible();
    await expect(sectionTabs).toBeHidden();
  } else {
    await expect(sidebar).toBeHidden();
    await expect(sectionTabs).toBeVisible();
  }
});

test('participant cabinet switches between the header nav and bottom tab bar at `md`', async ({
  page,
}) => {
  const account = await registerAndVerify(page.request);
  await login(page.request, account.email, account.password);

  await page.goto('/me');
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;

  const hamburger = page.locator(
    'button[aria-controls="app-header-mobile-menu"]',
  );
  const bottomTabBar = page.locator('nav.md\\:hidden').last();

  if (isDesktop) {
    await expect(hamburger).toBeHidden();
    await expect(bottomTabBar).toBeHidden();
  } else {
    await expect(hamburger).toBeVisible();
    await expect(bottomTabBar).toBeVisible();
  }
});

// CR-185 (UX handoff P2): a long ride title used to widen `/organizer`'s
// implicit grid track to its nowrap width — the whole page scrolled sideways
// on a phone (390 → 768 px). Both projects: no horizontal page scroll.
test('organizer dashboard never scrolls sideways with a long ride title', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: длинные названия');
  const title =
    'Большой гравийный марафон по Подмосковью через Звенигород и Рузу с остановкой на кофе';
  await createPublishedRide(page.request, title, {
    startsInMs: 2 * 24 * 60 * 60 * 1000,
  });

  await page.goto('/organizer');
  await expect(page.getByRole('link', { name: title })).toBeVisible();
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
