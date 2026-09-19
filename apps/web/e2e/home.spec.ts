import { expect, test } from '@playwright/test';

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
test('home page loads the discovery screen end to end', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Заезды' })).toBeVisible();

  const listPanel = page.getByTestId('discovery-list-panel');
  await expect(listPanel).toBeVisible();

  const emptyState = listPanel.getByText('Пока нет заездов');
  const rideLink = listPanel.locator('a[href^="/rides/"]').first();
  await expect(emptyState.or(rideLink)).toBeVisible();
});
