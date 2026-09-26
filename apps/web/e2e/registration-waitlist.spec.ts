import { expect, test } from '@playwright/test';
import {
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_TERMS,
} from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  joinWaitlist,
  login,
  registerAndVerify,
  registerForRide,
} from './helpers/api-fixtures';
import {
  confirmInDialog,
  newIsolatedRequest,
  newSignedInActor,
} from './helpers/ui';

// CR-135. Cancelling a registration on a full ride promotes the *first*
// waitlisted rider (CR-036, same locked transaction as the cancel) — the
// second one stays in the queue.
test('cancelling a registration promotes the first waitlisted rider', async ({
  page,
  browser,
}) => {
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб e2e: лист ожидания');
  const { rideId } = await createPublishedRide(
    organizerRequest,
    `E2E лист ожидания ${Date.now()}`,
    { participantLimit: 1 },
  );
  await organizerRequest.dispose();

  // The one seat: taken by the rider driving the UI below.
  const rider = await registerAndVerify(page.request);
  await login(page.request, rider.email, rider.password);
  await registerForRide(page.request, rideId);

  // Queue order is join order: `first` joins before `second`.
  const first = await newSignedInActor(browser);
  await joinWaitlist(first.context.request, rideId);
  const second = await newSignedInActor(browser);
  await joinWaitlist(second.context.request, rideId);

  await page.goto(`/rides/${rideId}`);
  await expect(
    page.getByRole('heading', {
      name: RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.cancel })
    .click();
  await confirmInDialog(page, REGISTRATION_ACTION_TERMS.cancel);
  await expect(page.getByText(RIDE_DETAIL_TERMS.cancelSuccess)).toBeVisible();

  // The freed seat went straight to `first` — the ride is full again, so the
  // canceller is offered the waitlist, not a seat.
  await page.reload();
  await expect(page.getByText(REGISTRATION_ACTION_TERMS.full)).toBeVisible();
  await expect(
    page.getByRole('button', { name: REGISTRATION_ACTION_TERMS.joinWaitlist }),
  ).toBeVisible();

  await first.page.goto(`/rides/${rideId}`);
  await expect(
    first.page.getByRole('heading', {
      name: RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle,
    }),
  ).toBeVisible();

  await second.page.goto(`/rides/${rideId}`);
  await expect(
    second.page.getByText(REGISTRATION_ACTION_TERMS.waitlisted),
  ).toBeVisible();
  await expect(
    second.page.getByRole('heading', {
      name: RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle,
    }),
  ).toHaveCount(0);

  await first.context.close();
  await second.context.close();
});
