import { expect, test, type Page } from '@playwright/test';
import { RIDE_ROUTE_TERMS } from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { malformedGpxFile, sampleGpxFile } from './helpers/fixtures';
import { mockApiError } from './helpers/mock';

// CR-138. `RouteUploadForm`'s upload/replace/delete cycle and its documented
// error codes (`.claude/rules/testing.md` "Visual regression" backlog item:
// "GPX upload and route display"). The route's *rendering* on `/rides/[id]`
// is covered separately by `visual-regression.spec.ts` — this spec only
// proves the organizer-side upload flow itself.

async function signInOrganizer(page: Page, clubName: string) {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, clubName);
}

test('organizer uploads, replaces and deletes a GPX route', async ({
  page,
}) => {
  await signInOrganizer(page, 'Клуб e2e: GPX');
  const { rideId } = await createDraftRide(page.request, 'E2E маршрут GPX');

  await page.goto(`/organizer/rides/${rideId}/route`);
  const fileInput = page.locator('#route-gpx-file');
  const upload = sampleGpxFile();
  await fileInput.setInputFiles(upload);
  await page.getByRole('button', { name: RIDE_ROUTE_TERMS.upload }).click();
  await expect(page.getByText(RIDE_ROUTE_TERMS.uploadSuccess)).toBeVisible();
  await expect(page.getByText(upload.name)).toBeVisible();

  const replacement = sampleGpxFile([
    [55.8, 37.7],
    [55.81, 37.72],
  ]);
  await fileInput.setInputFiles(replacement);
  await page.getByRole('button', { name: RIDE_ROUTE_TERMS.replace }).click();
  await expect(page.getByText(RIDE_ROUTE_TERMS.replaceSuccess)).toBeVisible();
  await expect(page.getByText(replacement.name)).toBeVisible();

  // CR-200 (KI-087): the app's own dialog, not a native confirm().
  await page.getByRole('button', { name: RIDE_ROUTE_TERMS.delete }).click();
  await page
    .getByRole('dialog', { name: RIDE_ROUTE_TERMS.deleteConfirmTitle })
    .getByRole('button', { name: RIDE_ROUTE_TERMS.delete })
    .click();
  await expect(page.getByText(RIDE_ROUTE_TERMS.deleteSuccess)).toBeVisible();
  await expect(page.getByText(RIDE_ROUTE_TERMS.emptyTitle)).toBeVisible();
});

test('a malformed GPX file is rejected with the real validation error', async ({
  page,
}) => {
  await signInOrganizer(page, 'Клуб e2e: GPX невалидный');
  const { rideId } = await createDraftRide(
    page.request,
    'E2E маршрут невалидный',
  );

  await page.goto(`/organizer/rides/${rideId}/route`);
  await page.locator('#route-gpx-file').setInputFiles(malformedGpxFile());
  await page.getByRole('button', { name: RIDE_ROUTE_TERMS.upload }).click();
  await expect(page.getByText(RIDE_ROUTE_TERMS.gpxInvalid)).toBeVisible();
});

test('route storage unavailable degrades without blocking the rest of the form', async ({
  page,
}) => {
  await signInOrganizer(page, 'Клуб e2e: GPX недоступно');
  const { rideId } = await createDraftRide(
    page.request,
    'E2E маршрут недоступно',
  );

  await mockApiError(
    page,
    `**/api/v1/rides/${rideId}/route`,
    503,
    'route_storage_unavailable',
  );

  await page.goto(`/organizer/rides/${rideId}/route`);
  await page.locator('#route-gpx-file').setInputFiles(sampleGpxFile());
  await page.getByRole('button', { name: RIDE_ROUTE_TERMS.upload }).click();
  await expect(
    page.getByText(RIDE_ROUTE_TERMS.storageUnavailable),
  ).toBeVisible();
  // Degraded, not broken: the upload control is still there to retry with.
  await expect(page.locator('#route-gpx-file')).toBeEnabled();
});
