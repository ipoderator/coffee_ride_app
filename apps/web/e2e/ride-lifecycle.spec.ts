import { expect, test, type Page } from '@playwright/test';
import {
  FINISH_CHECKIN_TERMS,
  RIDE_EDIT_TERMS,
  RIDE_READINESS_TERMS,
  RIDE_STATUS_TERMS,
} from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
  registerForRide,
  setDisplayName,
} from './helpers/api-fixtures';
import { confirmInDialog, newIsolatedRequest } from './helpers/ui';

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
  await expect(page.getByText(successMessage, { exact: true })).toBeVisible();
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

  // CR-192: this draft has no route, which can never be added once
  // published — publishing asks first.
  await page.getByRole('button', { name: RIDE_EDIT_TERMS.publish }).click();
  expect(await publicStatus(rideId)).toBe(404);
  await confirmInDialog(page, RIDE_EDIT_TERMS.publishNoRouteConfirm);
  await expect(
    page.getByText(RIDE_EDIT_TERMS.publishSuccess, { exact: true }),
  ).toBeVisible();
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

// CR-185: finishing with riders whose outcome is still undecided asks first
// and names how many; declining leaves the ride started.
test('organizer confirms finishing a ride with unresolved riders', async ({
  page,
}) => {
  await signInOrganizer(page, 'Клуб e2e: завершение');
  const { rideId } = await createPublishedRide(
    page.request,
    `E2E завершение ${Date.now()}`,
  );
  const rider = await newIsolatedRequest();
  const account = await registerAndVerify(rider);
  await login(rider, account.email, account.password);
  await registerForRide(rider, rideId);
  await rider.dispose();

  await page.goto(`/organizer/rides/${rideId}/edit`);
  await transition(
    page,
    RIDE_EDIT_TERMS.closeRegistration,
    RIDE_EDIT_TERMS.closeRegistrationSuccess,
  );
  await transition(page, RIDE_EDIT_TERMS.start, RIDE_EDIT_TERMS.startSuccess);

  const finish = page.getByRole('button', { name: RIDE_EDIT_TERMS.finish });
  const dialog = page.getByRole('dialog');
  await finish.click();
  await expect(dialog).toContainText(
    FINISH_CHECKIN_TERMS.finishConfirmUnresolved(1),
  );
  await dialog
    .getByRole('button', { name: FINISH_CHECKIN_TERMS.finishConfirmCancel })
    .click();
  await expect(dialog).toBeHidden();
  await expect(finish).toBeFocused();

  await finish.click();
  await confirmInDialog(page, FINISH_CHECKIN_TERMS.finishConfirmAction);
  await expect(
    page.getByText(FINISH_CHECKIN_TERMS.finishedWithUnresolved(1)),
  ).toBeVisible();
  await expect(finish).toHaveCount(0);
});

// CR-189. The workspace frame's results chip («Не отмечено: N» → «Все отмечены»,
// «Не подтверждено: N» → «Итоги подведены») follows every mark made in the
// participants table at once — the QA run saw «Не подтверждено: 1» stay until
// a reload. Same ride, from the start to the last decision, in one page load.
test('organizer marks riders and the workspace frame follows without a reload', async ({
  page,
}) => {
  const T = RIDE_READINESS_TERMS.participants;
  await signInOrganizer(page, 'Клуб e2e: отметки');
  const { rideId } = await createPublishedRide(
    page.request,
    `E2E отметки ${Date.now()}`,
  );
  const names = ['Райдер Анна', 'Райдер Борис', 'Райдер Вера'] as const;
  for (const name of names) {
    const rider = await newIsolatedRequest();
    const account = await registerAndVerify(rider);
    await login(rider, account.email, account.password);
    await setDisplayName(rider, name);
    await registerForRide(rider, rideId);
    await rider.dispose();
  }

  await page.goto(`/organizer/rides/${rideId}/participants`);
  await transition(
    page,
    RIDE_EDIT_TERMS.closeRegistration,
    RIDE_EDIT_TERMS.closeRegistrationSuccess,
  );
  await transition(page, RIDE_EDIT_TERMS.start, RIDE_EDIT_TERMS.startSuccess);
  // From here on the page is never reloaded: a navigation would clear this.
  await page.evaluate(() => {
    (window as unknown as { pageLoadMarker: boolean }).pageLoadMarker = true;
  });

  const chip = (label: string) => page.getByText(label, { exact: true });
  const row = (name: string) =>
    page.getByRole('group', {
      name: FINISH_CHECKIN_TERMS.rowActionsLabel(name),
    });
  const mark = (name: string, label: string) =>
    row(name).getByRole('button', { name: label, exact: true }).click();

  // Before the finish: «Не отмечено: N» counts down, undo counts back up.
  await expect(chip(T.unresolvedChip(3))).toBeVisible();
  await mark(names[0], FINISH_CHECKIN_TERMS.confirmOne);
  await expect(chip(T.unresolvedChip(2))).toBeVisible();
  await mark(names[1], FINISH_CHECKIN_TERMS.markDnf);
  await expect(chip(T.unresolvedChip(1))).toBeVisible();
  await mark(names[2], FINISH_CHECKIN_TERMS.markNoShow);
  await expect(chip(T.allMarkedChip)).toBeVisible();
  await expect(chip(T.unresolvedChip(1))).toHaveCount(0);
  await expect(page.getByTestId('unresolved-before-finish')).toHaveCount(0);
  await mark(names[2], FINISH_CHECKIN_TERMS.undo);
  await expect(chip(T.unresolvedChip(1))).toBeVisible();
  await expect(page.getByTestId('unresolved-before-finish')).toBeVisible();

  // Finish with the one undecided rider left: the results are not closed.
  await page.getByRole('button', { name: RIDE_EDIT_TERMS.finish }).click();
  await confirmInDialog(page, FINISH_CHECKIN_TERMS.finishConfirmAction);
  await expect(
    page.getByText(FINISH_CHECKIN_TERMS.finishedWithUnresolved(1)),
  ).toBeVisible();
  await expect(chip(T.unconfirmedChip(1))).toBeVisible();

  // The last decision closes them — the frame says so at once.
  await mark(names[2], FINISH_CHECKIN_TERMS.confirmOne);
  await expect(chip(T.finishedChip)).toBeVisible();
  await expect(chip(T.unconfirmedChip(1))).toHaveCount(0);
  // The note about the undecided rider is gone with them.
  await expect(
    page.getByText(FINISH_CHECKIN_TERMS.finishedWithUnresolved(1)),
  ).toHaveCount(0);
  await expect(
    page.getByText(RIDE_EDIT_TERMS.finishSuccess, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { pageLoadMarker?: boolean }).pageLoadMarker,
    ),
  ).toBe(true);

  // …and it is what the server says, not just what the screen was told.
  await page.reload();
  await expect(chip(T.finishedChip)).toBeVisible();
});

test('organizer cancels a ride with registration open', async ({ page }) => {
  await signInOrganizer(page, 'Клуб e2e: отмена');
  const rideTitle = `E2E отмена ${Date.now()}`;
  const { rideId } = await createPublishedRide(page.request, rideTitle);

  await page.goto(`/organizer/rides/${rideId}/edit`);
  const cancel = page.getByRole('button', { name: RIDE_EDIT_TERMS.cancel });

  // CR-195: the app's own dialog, not a native confirm(). Declining it
  // leaves the ride as it was.
  await cancel.click();
  const dialog = page.getByRole('dialog', {
    name: RIDE_EDIT_TERMS.cancelConfirmTitle,
  });
  await expect(dialog).toContainText(RIDE_EDIT_TERMS.cancelConfirmDescription);
  await dialog
    .getByRole('button', { name: RIDE_EDIT_TERMS.cancelKeep })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText(RIDE_EDIT_TERMS.cancelSuccess, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: RIDE_EDIT_TERMS.closeRegistration }),
  ).toBeVisible();

  await cancel.click();
  await dialog.getByRole('button', { name: RIDE_EDIT_TERMS.cancel }).click();
  await expect(
    page.getByText(RIDE_EDIT_TERMS.cancelSuccess, { exact: true }),
  ).toBeVisible();
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
