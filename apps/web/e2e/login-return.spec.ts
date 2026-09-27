import { expect, test } from '@playwright/test';
import { AUTH_TERMS, REGISTRATION_ACTION_TERMS } from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// CR-141 (KI-064): an anonymous visitor's «Зарегистрироваться» used to send
// them to a bare `/login` — after signing in they landed on `/me` and had to
// find the ride again. The tested journey: ride → sign in → back on the same
// ride → register. The open-redirect cases live in `next-path.test.ts`.
test('an anonymous «Зарегистрироваться» returns to the ride after sign-in', async ({
  page,
}) => {
  // Fixtures on isolated contexts: `page` must stay anonymous until the UI
  // sign-in the test is about.
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб для e2e-теста входа');
  const rideTitle = `E2E возврат после входа ${Date.now()}`;
  const { rideId } = await createPublishedRide(organizerRequest, rideTitle);
  await organizerRequest.dispose();

  const participantRequest = await newIsolatedRequest();
  const participant = await registerAndVerify(participantRequest);
  await participantRequest.dispose();

  const next = encodeURIComponent(`/rides/${rideId}`);

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();

  await page.waitForURL(`/login?next=${next}`);
  // «Нет аккаунта?» keeps the return target too.
  await expect(
    page.getByRole('link', { name: AUTH_TERMS.registerLink }),
  ).toHaveAttribute('href', `/register?next=${next}`);

  await page.getByLabel(AUTH_TERMS.emailLabel).fill(participant.email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(participant.password);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();

  await page.waitForURL(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();
  await expect(
    page.getByRole('button', { name: REGISTRATION_ACTION_TERMS.cancel }),
  ).toBeVisible();
});
