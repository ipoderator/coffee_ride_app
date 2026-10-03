import { expect, test, type Page } from '@playwright/test';
import { AVATAR_TERMS, RIDE_COVER_TERMS } from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { sampleImageFile } from './helpers/fixtures';
import { mockApiError } from './helpers/mock';

// CR-138. Upload/replace/delete for the three image forms that share the
// same shape (`AvatarUploadForm` x2, `CoverImageUploadForm`) plus their
// documented storage-unavailable degraded state
// (`.claude/rules/resilience.md`). Real image bytes throughout — `apps/api`'s
// `processImage` (`lib/image-processing.ts`) decodes with `sharp` and
// ignores the declared filename/`Content-Type`, so `sampleImageFile()` alone
// covers every upload target here.

async function uploadReplaceDelete(
  page: Page,
  fileInputSelector: string,
  terms: {
    upload: string;
    replace: string;
    delete: string;
    deleteConfirmTitle: string;
    uploadSuccess: string;
    replaceSuccess: string;
    deleteSuccess: string;
  },
) {
  const fileInput = page.locator(fileInputSelector);

  await fileInput.setInputFiles(sampleImageFile());
  await page.getByRole('button', { name: terms.upload }).click();
  await expect(page.getByText(terms.uploadSuccess)).toBeVisible();

  await fileInput.setInputFiles(sampleImageFile('photo-2.png'));
  await page.getByRole('button', { name: terms.replace }).click();
  await expect(page.getByText(terms.replaceSuccess)).toBeVisible();

  // CR-200 (KI-087): the app's own dialog, not a native confirm().
  await page.getByRole('button', { name: terms.delete }).click();
  const dialog = page.getByRole('dialog', { name: terms.deleteConfirmTitle });
  await dialog.getByRole('button', { name: terms.delete }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(terms.deleteSuccess)).toBeVisible();
  await expect(page.getByRole('button', { name: terms.upload })).toBeVisible();
}

test('organizer uploads, replaces and deletes their avatar', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: аватар организатора');

  await page.goto('/organizer/profile');
  await uploadReplaceDelete(page, '#organizer-avatar-file', AVATAR_TERMS);
});

test('participant uploads, replaces and deletes their avatar', async ({
  page,
}) => {
  const account = await registerAndVerify(page.request);
  await login(page.request, account.email, account.password);

  await page.goto('/me/profile');
  await uploadReplaceDelete(page, '#avatar-file', AVATAR_TERMS);
});

test('organizer uploads, replaces and deletes a ride cover image', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: обложка');
  const { rideId } = await createDraftRide(page.request, 'E2E обложка заезда');

  await page.goto(`/organizer/rides/${rideId}/cover`);
  await uploadReplaceDelete(page, '#cover-image-file', RIDE_COVER_TERMS);
});

test('avatar storage unavailable degrades without blocking the form', async ({
  page,
}) => {
  const account = await registerAndVerify(page.request);
  await login(page.request, account.email, account.password);

  await mockApiError(
    page,
    '**/api/v1/users/me/avatar',
    503,
    'avatar_storage_unavailable',
  );

  await page.goto('/me/profile');
  await page.locator('#avatar-file').setInputFiles(sampleImageFile());
  await page.getByRole('button', { name: AVATAR_TERMS.upload }).click();
  await expect(page.getByText(AVATAR_TERMS.storageUnavailable)).toBeVisible();
  await expect(page.locator('#avatar-file')).toBeEnabled();
});

test('cover storage unavailable degrades without blocking the form', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: обложка недоступна');
  const { rideId } = await createDraftRide(
    page.request,
    'E2E обложка недоступна',
  );

  await mockApiError(
    page,
    `**/api/v1/rides/${rideId}/cover`,
    503,
    'cover_storage_unavailable',
  );

  await page.goto(`/organizer/rides/${rideId}/cover`);
  await page.locator('#cover-image-file').setInputFiles(sampleImageFile());
  await page.getByRole('button', { name: RIDE_COVER_TERMS.upload }).click();
  await expect(
    page.getByText(RIDE_COVER_TERMS.storageUnavailable),
  ).toBeVisible();
  await expect(page.locator('#cover-image-file')).toBeEnabled();
});
