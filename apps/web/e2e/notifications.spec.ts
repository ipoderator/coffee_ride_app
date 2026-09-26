import { expect, test, type Locator, type Page } from '@playwright/test';
import { NOTIFICATIONS_TERMS, RIDE_UPDATES_TERMS } from 'ui';
import {
  cancelRide,
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
  registerForRide,
} from './helpers/api-fixtures';
import { newSignedInActor } from './helpers/ui';

// CR-135. In-app notifications (CR-039/CR-040/CR-041): an organizer's ride
// update and the ride's cancellation both reach a registered participant's
// inbox, and opening one marks it read. Fan-out runs through the Redis queue
// when one is configured (CR-050), so the inbox is polled, not read once.

const UPDATE_MESSAGE = `E2E: старт переносится на 9:00 (${Date.now()})`;

function notificationCard(page: Page, label: string): Locator {
  return page.getByRole('link').filter({ hasText: label });
}

async function openInbox(page: Page) {
  await page.goto('/me/notifications');
  await expect(
    page.getByRole('heading', { name: NOTIFICATIONS_TERMS.pageTitle }),
  ).toBeVisible();
}

test('ride update and cancellation reach the inbox; opening one marks it read', async ({
  page,
  browser,
}) => {
  const organizer = await newSignedInActor(browser);
  await createOrganizerProfile(
    organizer.context.request,
    'Клуб e2e: уведомления',
  );
  const rideTitle = `E2E уведомления ${Date.now()}`;
  const { rideId } = await createPublishedRide(
    organizer.context.request,
    rideTitle,
  );

  const participant = await registerAndVerify(page.request);
  await login(page.request, participant.email, participant.password);
  await registerForRide(page.request, rideId);

  // The organizer sends the update through their own screen.
  await organizer.page.goto(`/organizer/rides/${rideId}/updates`);
  await organizer.page
    .getByLabel(RIDE_UPDATES_TERMS.messageLabel)
    .fill(UPDATE_MESSAGE);
  await organizer.page
    .getByRole('button', { name: RIDE_UPDATES_TERMS.send })
    .click();
  await expect(
    organizer.page.getByText(RIDE_UPDATES_TERMS.sendSuccess),
  ).toBeVisible();
  await cancelRide(organizer.context.request, rideId);
  await organizer.context.close();

  const update = notificationCard(page, UPDATE_MESSAGE);
  const cancellation = notificationCard(
    page,
    NOTIFICATIONS_TERMS.rideCancelledLabel,
  );
  await expect(async () => {
    await openInbox(page);
    await expect(update).toBeVisible({ timeout: 2_000 });
    await expect(cancellation).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await expect(update).toContainText(NOTIFICATIONS_TERMS.rideUpdateLabel);
  await expect(update).toContainText(rideTitle);
  await expect(cancellation).toContainText(rideTitle);
  await expect(update).toContainText(NOTIFICATIONS_TERMS.unreadLabel);
  await expect(cancellation).toContainText(NOTIFICATIONS_TERMS.unreadLabel);

  // Opening the update takes the participant to the ride…
  await update.click();
  await page.waitForURL(`/rides/${rideId}`);

  // …and marks only that one read — server-side, so it survives a reload.
  await expect(async () => {
    await openInbox(page);
    await expect(update).toBeVisible({ timeout: 2_000 });
    await expect(update).not.toContainText(NOTIFICATIONS_TERMS.unreadLabel, {
      timeout: 2_000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(cancellation).toContainText(NOTIFICATIONS_TERMS.unreadLabel);
});
