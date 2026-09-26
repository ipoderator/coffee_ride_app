import { expect, test, type Page } from '@playwright/test';
import { RIDE_EDIT_TERMS, RIDE_STATUS_TERMS } from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// CR-135. The organizer-side ride lifecycle through `EditRideForm`'s buttons
// (`docs/product.md` → Lifecycle): draft → published → registration_open →
// registration_closed → started → finished, and the cancel dead end.
// critical-journeys.spec.ts already covers create → publish → open; this
// drives every transition after that and checks what the public sees.

async function signInOrganizer(page: Page, clubName: string) {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, clubName);
}

async function transition(
  page: Page,
  buttonLabel: string,
  successMessage: string,
) {
  await page.getByRole('button', { name: buttonLabel }).click();
  await expect(page.getByText(successMessage)).toBeVisible();
}

async function publicStatus(rideId: string): Promise<number> {
  const anonymous = await newIsolatedRequest();
  const response = await anonymous.get(`/api/v1/rides/${rideId}`);
  await anonymous.dispose();
  return response.status();
}

test('organizer takes a ride from draft to finished', async ({ page }) => {
  await signInOrganizer(page, 'Клуб e2e: жизненный цикл');
  const rideTitle = `E2E жизненный цикл ${Date.now()}`;
  const { rideId } = await createDraftRide(page.request, rideTitle);

  // A draft is the organizer's alone.
  expect(await publicStatus(rideId)).toBe(404);

  await page.goto(`/organizer/rides/${rideId}/edit`);
  await expect(
    page.getByRole('heading', { name: RIDE_EDIT_TERMS.pageTitle }),
  ).toBeVisible();

  await transition(
    page,
    RIDE_EDIT_TERMS.publish,
    RIDE_EDIT_TERMS.publishSuccess,
  );
  expect(await publicStatus(rideId)).toBe(200);
  await transition(
    page,
    RIDE_EDIT_TERMS.openRegistration,
    RIDE_EDIT_TERMS.openRegistrationSuccess,
  );
  await transition(
    page,
    RIDE_EDIT_TERMS.closeRegistration,
    RIDE_EDIT_TERMS.closeRegistrationSuccess,
  );
  await transition(page, RIDE_EDIT_TERMS.start, RIDE_EDIT_TERMS.startSuccess);
  await transition(page, RIDE_EDIT_TERMS.finish, RIDE_EDIT_TERMS.finishSuccess);

  // `finished` is terminal: no lifecycle action is left to offer.
  for (const label of [
    RIDE_EDIT_TERMS.publish,
    RIDE_EDIT_TERMS.openRegistration,
    RIDE_EDIT_TERMS.closeRegistration,
    RIDE_EDIT_TERMS.start,
    RIDE_EDIT_TERMS.finish,
    RIDE_EDIT_TERMS.cancel,
  ]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
  }

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await expect(
    page.getByText(RIDE_STATUS_TERMS.finished.label, { exact: true }),
  ).toBeVisible();
});

test('organizer cancels a ride with registration open', async ({ page }) => {
  await signInOrganizer(page, 'Клуб e2e: отмена');
  const rideTitle = `E2E отмена ${Date.now()}`;
  const { rideId } = await createPublishedRide(page.request, rideTitle);

  await page.goto(`/organizer/rides/${rideId}/edit`);
  const cancel = page.getByRole('button', { name: RIDE_EDIT_TERMS.cancel });

  // Declining the native confirm() leaves the ride as it was.
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe(RIDE_EDIT_TERMS.cancelConfirm);
    void dialog.dismiss();
  });
  await cancel.click();
  await expect(page.getByText(RIDE_EDIT_TERMS.cancelSuccess)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: RIDE_EDIT_TERMS.closeRegistration }),
  ).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await cancel.click();
  await expect(page.getByText(RIDE_EDIT_TERMS.cancelSuccess)).toBeVisible();
  await expect(cancel).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: RIDE_EDIT_TERMS.closeRegistration }),
  ).toHaveCount(0);

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await expect(
    page.getByText(RIDE_STATUS_TERMS.cancelled.label, { exact: true }),
  ).toBeVisible();
});
