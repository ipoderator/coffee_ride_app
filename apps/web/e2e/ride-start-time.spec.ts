import { expect, test, type Page } from '@playwright/test';
import {
  DATE_PICKER_TERMS,
  RIDE_CREATE_TERMS,
  RIDE_EDIT_TERMS,
  RIDE_ROUTE_TERMS,
} from 'ui';
import {
  createOrganizerProfile,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';
import { sampleGpxFile } from './helpers/fixtures';

// QA live audit 2026-10-08, item 1 (P1): a start entered as 08:00 on the
// wizard's step 1, with a GPX file picked before the first save, came back as
// another time on step 4 and after a reload. The browser runs in Moscow time
// so the ride's zone and the browser's agree, as for the reporting organizer.
test.use({ timezoneId: 'Europe/Moscow' });

function startTimeInput(page: Page) {
  return page.getByLabel(RIDE_CREATE_TERMS.startTimeLabel, { exact: true });
}

test('the start time survives the GPX pick, the draft save, step 4 and a reload', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: время старта');

  await page.goto('/organizer/rides/new');
  await page
    .getByLabel(RIDE_CREATE_TERMS.titleLabel)
    .fill(`E2E время старта ${Date.now()}`);
  await page.getByLabel(RIDE_CREATE_TERMS.startDateLabel).click();
  await page.getByRole('button', { name: DATE_PICKER_TERMS.tomorrow }).click();
  await startTimeInput(page).fill('08:00');

  await page.locator('#ride-gpx').setInputFiles(sampleGpxFile());
  await expect(startTimeInput(page)).toHaveValue('08:00');

  await page.getByRole('button', { name: RIDE_CREATE_TERMS.saveDraft }).click();
  await expect(page).toHaveURL(/\/organizer\/rides\/new\?ride=/);
  await expect(startTimeInput(page)).toHaveValue('08:00');

  await page.getByRole('button', { name: RIDE_CREATE_TERMS.next }).click();
  await expect(
    page.getByRole('heading', { name: RIDE_ROUTE_TERMS.pageTitle }),
  ).toBeVisible();
  const rideId = /\/organizer\/rides\/([^/]+)\/route/.exec(page.url())![1]!;

  await page.goto(`/organizer/rides/${rideId}/edit?wizard=1`);
  await expect(
    page.getByRole('heading', { name: RIDE_EDIT_TERMS.pageTitle }),
  ).toBeVisible();
  await expect(startTimeInput(page)).toHaveValue('08:00');

  await page.getByRole('button', { name: RIDE_EDIT_TERMS.save }).click();
  await expect(page.getByText(RIDE_EDIT_TERMS.saveSuccess)).toBeVisible();
  await expect(startTimeInput(page)).toHaveValue('08:00');

  await page.reload();
  await expect(startTimeInput(page)).toHaveValue('08:00');
});

// The audit's exact symptoms: the field showed 08:00 while React state held
// another time (a native picker's or tool's change that fired no `input`
// event). Picking the GPX re-rendered the form and wrote the stale value back;
// the save sent it. `TimeInput` keeps the field and saves what it shows.
async function setTimeSilently(page: Page, value: string) {
  await startTimeInput(page).evaluate((element, next) => {
    (element as HTMLInputElement).value = next;
  }, value);
}

test('a time changed without an input event is still the time that is saved', async ({
  page,
}) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: время без события');

  await page.goto('/organizer/rides/new');
  await page
    .getByLabel(RIDE_CREATE_TERMS.titleLabel)
    .fill(`E2E время без события ${Date.now()}`);
  await page.getByLabel(RIDE_CREATE_TERMS.startDateLabel).click();
  await page.getByRole('button', { name: DATE_PICKER_TERMS.tomorrow }).click();
  await startTimeInput(page).fill('12:12');
  await setTimeSilently(page, '08:00');

  await page.locator('#ride-gpx').setInputFiles(sampleGpxFile());
  await expect(startTimeInput(page)).toHaveValue('08:00');

  await page.getByRole('button', { name: RIDE_CREATE_TERMS.saveDraft }).click();
  await expect(page).toHaveURL(/\/organizer\/rides\/new\?ride=/);
  const rideId = new URL(page.url()).searchParams.get('ride')!;
  await page.reload();
  await expect(startTimeInput(page)).toHaveValue('08:00');

  // Step 4 (the draft's edit form): the same, then a reload.
  await page.goto(`/organizer/rides/${rideId}/edit?wizard=1`);
  await expect(startTimeInput(page)).toHaveValue('08:00');
  await setTimeSilently(page, '09:15');
  await page.getByRole('button', { name: RIDE_EDIT_TERMS.save }).click();
  await expect(page.getByText(RIDE_EDIT_TERMS.saveSuccess)).toBeVisible();
  await expect(startTimeInput(page)).toHaveValue('09:15');
  await page.reload();
  await expect(startTimeInput(page)).toHaveValue('09:15');
});
