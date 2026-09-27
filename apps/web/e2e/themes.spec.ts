import { expect, test, type Page } from '@playwright/test';
import { setStoredTheme } from './helpers/theme';

// CR-138. `apps/web/src/lib/theme/theme.ts`: the applied class is `.dark` on
// `<html>` (not a `data-theme` attribute), an absent stored preference
// defaults to dark (ADR-024 §4, not a proxy for `prefers-color-scheme`), and
// `'system'` is the one preference that actually reads the OS setting.

async function mockEmptyRideList(page: Page) {
  await page.route(/\/api\/v1\/rides(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
}

test('light preference applies the light theme', async ({ page }) => {
  await setStoredTheme(page, 'light');
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('dark preference applies the dark theme', async ({ page }) => {
  await setStoredTheme(page, 'dark');
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('system preference follows the OS color scheme', async ({ page }) => {
  await setStoredTheme(page, 'system', { systemPrefersDark: false });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await setStoredTheme(page, 'system', { systemPrefersDark: true });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('an unset preference defaults to dark, not the OS setting', async ({
  page,
}) => {
  // No `setStoredTheme` call — the pre-hydration script's own default path
  // (ADR-024 §4: absent key means "never chosen", which resolves to dark
  // regardless of what the OS prefers).
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test.describe('visual baseline', () => {
  test('discovery screen in light theme', async ({ page }) => {
    await mockEmptyRideList(page);
    await setStoredTheme(page, 'light');
    await page.goto('/');
    await expect(page).toHaveScreenshot('discovery-light.png');
  });

  test('discovery screen in dark theme', async ({ page }) => {
    await mockEmptyRideList(page);
    await setStoredTheme(page, 'dark');
    await page.goto('/');
    await expect(page).toHaveScreenshot('discovery-dark.png');
  });
});
