import { expect, test } from '@playwright/test';
import { NOT_FOUND_TERMS, RIDE_DETAIL_TERMS } from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// QA live audit 2026-10-08, items 4–5: a missing ride answered HTTP 200 with
// a client-side «не найден» and no `h1`; an unknown URL showed Next's English
// default 404.
const MISSING_RIDE = '/rides/00000000-0000-4000-8000-000000000000';

test('a missing ride answers 404 with a Russian h1 and a way back', async ({
  page,
}) => {
  const response = await page.goto(MISSING_RIDE);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: RIDE_DETAIL_TERMS.notFoundTitle,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: NOT_FOUND_TERMS.toDiscovery }),
  ).toHaveAttribute('href', '/');
});

test('a malformed ride id answers 404 too', async ({ request }) => {
  const response = await request.get('/rides/not-a-ride-id');
  expect(response.status()).toBe(404);
});

test('an unknown URL gets the branded Russian 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: NOT_FOUND_TERMS.pageTitle }),
  ).toBeVisible();
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
  await page.getByRole('link', { name: NOT_FOUND_TERMS.toDiscovery }).click();
  await expect(page).toHaveURL('/');
});

// The server-side lookup forwards the viewer's session: a draft stays the
// organizer's own page, and is a 404 to anyone else.
test('a draft is a 404 to a guest and an ordinary page to its organizer', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: 404 черновика');
  const title = `E2E черновик 404 ${Date.now()}`;
  const { rideId } = await createDraftRide(page.request, title);

  const guest = await newIsolatedRequest();
  expect((await guest.get(`/rides/${rideId}`)).status()).toBe(404);
  await guest.dispose();

  const response = await page.goto(`/rides/${rideId}`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
});
