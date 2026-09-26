import { expect, test } from '@playwright/test';
import { AUTH_TERMS, FORGOT_PASSWORD_TERMS, RESET_PASSWORD_TERMS } from 'ui';
import { registerAndVerify } from './helpers/api-fixtures';
import { seedPasswordResetToken } from './helpers/db-fixtures';
import { loginViaUi, newIsolatedRequest } from './helpers/ui';

// CR-135. Password reset through the UI (CR-060): request a link, set a new
// password on `/reset-password`, sign in with it. The link a real email would
// carry is seeded straight into Postgres (`./helpers/db-fixtures.ts` explains
// why) — everything after that is the real web + API flow.

const NEW_PASSWORD = 'a-brand-new-e2e-password-456';

test('a user resets a forgotten password and signs in with the new one', async ({
  page,
}) => {
  const accountRequest = await newIsolatedRequest();
  const account = await registerAndVerify(accountRequest);
  await accountRequest.dispose();

  // Step 1: the request form. Its answer never says whether the account
  // exists (no enumeration), so all it can show is the generic confirmation.
  await page.goto('/login');
  await page.getByRole('link', { name: AUTH_TERMS.forgotPasswordLink }).click();
  await expect(
    page.getByRole('heading', { name: FORGOT_PASSWORD_TERMS.pageTitle }),
  ).toBeVisible();
  await page.getByLabel(FORGOT_PASSWORD_TERMS.emailLabel).fill(account.email);
  await page
    .getByRole('button', { name: FORGOT_PASSWORD_TERMS.submit })
    .click();
  await expect(
    page.getByText(FORGOT_PASSWORD_TERMS.successTitle),
  ).toBeVisible();

  // Step 2: the emailed link.
  const token = await seedPasswordResetToken(account.userId);
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel(RESET_PASSWORD_TERMS.passwordLabel).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: RESET_PASSWORD_TERMS.submit }).click();
  await expect(page.getByText(RESET_PASSWORD_TERMS.successTitle)).toBeVisible();

  // The link is single-use.
  await page.goto(`/reset-password?token=${token}`);
  await page
    .getByLabel(RESET_PASSWORD_TERMS.passwordLabel)
    .fill('yet-another-e2e-password-789');
  await page.getByRole('button', { name: RESET_PASSWORD_TERMS.submit }).click();
  await expect(
    page.getByText(RESET_PASSWORD_TERMS.invalidOrExpired),
  ).toBeVisible();

  // Step 3: the old password is gone, the new one works.
  await page.goto('/login');
  await page.getByLabel(AUTH_TERMS.emailLabel).fill(account.email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(account.password);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();
  await expect(page.getByText(AUTH_TERMS.invalidCredentials)).toBeVisible();

  await loginViaUi(page, account.email, NEW_PASSWORD);
});

test('an invalid reset link is rejected', async ({ page }) => {
  await page.goto(`/reset-password?token=${'0'.repeat(64)}`);
  await page.getByLabel(RESET_PASSWORD_TERMS.passwordLabel).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: RESET_PASSWORD_TERMS.submit }).click();
  await expect(
    page.getByText(RESET_PASSWORD_TERMS.invalidOrExpired),
  ).toBeVisible();
});
