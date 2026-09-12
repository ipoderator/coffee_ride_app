import { expect, test } from '@playwright/test';

// Bootstrap-placeholder smoke spec (CR-008/CR-002). Real critical-journey
// specs (`.claude/rules/testing.md`: discover+register, create+publish,
// view participants) start once those screens exist (CR-011+).
test('home page shows the bootstrap placeholder', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Coffee Ride' }),
  ).toBeVisible();
  await expect(
    page.getByText('Платформа собирается. Скоро здесь будут заезды.'),
  ).toBeVisible();
});
