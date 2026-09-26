import { expect, test, type Page } from '@playwright/test';
import { PROFILE_TERMS, RIDER_PROFILE_TERMS } from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
  registerForRide,
  updateMe,
} from './helpers/api-fixtures';
import { newIsolatedRequest, newSignedInActor } from './helpers/ui';

// CR-135. The three `profileVisibility` tiers (CR-126, ADR-023), set by the
// rider on `/me/profile` and checked from the rider card
// (`/rides/[id]/riders/[registrationId]`) as seen by a co-rider of the same
// ride and by a signed-in outsider who isn't riding it:
// - open            → both see it;
// - co_participants → the co-rider sees it, the outsider doesn't;
// - closed          → neither does (the owner still does).

const BIO = `E2E-био ${Date.now()}`;

async function setVisibility(page: Page, value: string) {
  await page.goto('/me/profile');
  const select = page.getByLabel(PROFILE_TERMS.profileVisibilityLabel);
  await select.selectOption(value);
  await page
    .locator('form', { has: select })
    .getByRole('button', { name: PROFILE_TERMS.saveSubmit })
    .click();
  await expect(page.getByText(PROFILE_TERMS.saveSuccess)).toBeVisible();
}

async function expectCard(page: Page, url: string, visible: boolean) {
  await page.goto(url);
  if (visible) {
    await expect(page.getByText(BIO)).toBeVisible();
  } else {
    await expect(
      page.getByText(RIDER_PROFILE_TERMS.profilePrivateTitle),
    ).toBeVisible();
    await expect(page.getByText(BIO)).toHaveCount(0);
  }
}

test('profile visibility: open, co-participants only, closed', async ({
  page,
  browser,
}) => {
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб e2e: видимость');
  const { rideId } = await createPublishedRide(
    organizerRequest,
    `E2E видимость ${Date.now()}`,
  );
  await organizerRequest.dispose();

  const rider = await registerAndVerify(page.request);
  await login(page.request, rider.email, rider.password);
  await updateMe(page.request, { displayName: 'Е2Е Райдер', bio: BIO });
  const { registrationId } = await registerForRide(page.request, rideId);
  const card = `/rides/${rideId}/riders/${registrationId}`;

  const coRider = await newSignedInActor(browser);
  await registerForRide(coRider.context.request, rideId);
  const outsider = await newSignedInActor(browser);

  await setVisibility(page, 'open');
  await expectCard(coRider.page, card, true);
  await expectCard(outsider.page, card, true);

  await setVisibility(page, 'co_participants');
  await expectCard(coRider.page, card, true);
  await expectCard(outsider.page, card, false);

  await setVisibility(page, 'closed');
  await expectCard(coRider.page, card, false);
  await expectCard(outsider.page, card, false);
  await expectCard(page, card, true);

  await coRider.context.close();
  await outsider.context.close();
});
