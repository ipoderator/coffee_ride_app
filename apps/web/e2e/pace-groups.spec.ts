import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  formatGroupPace,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_GROUP_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
} from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  createRideGroup,
  login,
  registerAndVerify,
  registerForRide,
  unsafeRequest,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// CR-135. Pace groups (CR-117/CR-119, ADR-022) from the participant's side:
// a ride with groups can't be joined without picking one, and a registered
// rider can move to another group.

const SLOW = { name: 'Спокойная', paceKmh: 25 };
const FAST = { name: 'Быстрая', paceKmh: 32 };

async function createRideWithGroups(): Promise<{ rideId: string }> {
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб e2e: группы');
  const { rideId } = await createPublishedRide(
    organizerRequest,
    `E2E группы ${Date.now()}`,
  );
  await createRideGroup(organizerRequest, rideId, SLOW.name, SLOW.paceKmh);
  await createRideGroup(organizerRequest, rideId, FAST.name, FAST.paceKmh);
  await organizerRequest.dispose();
  return { rideId };
}

async function signInParticipant(request: APIRequestContext) {
  const participant = await registerAndVerify(request);
  await login(request, participant.email, participant.password);
}

function ridingIn(group: { name: string; paceKmh: number }) {
  return RIDE_DETAIL_GROUP_TERMS.ridingIn(
    group.name,
    formatGroupPace(group.paceKmh),
  );
}

test('a ride with groups requires choosing one to register', async ({
  page,
}) => {
  const { rideId } = await createRideWithGroups();
  await signInParticipant(page.request);

  // Server side first: the button being disabled is not the guard.
  const withoutGroup = await unsafeRequest(
    page.request,
    'post',
    `/api/v1/rides/${rideId}/register`,
  );
  expect(withoutGroup.status()).toBe(422);
  expect((await withoutGroup.json()).code).toBe('group_required');

  await page.goto(`/rides/${rideId}`);
  const register = page.getByRole('button', {
    name: REGISTRATION_ACTION_TERMS.register,
  });
  await expect(register).toBeDisabled();
  await expect(page.getByText(RIDE_DETAIL_GROUP_TERMS.pickHint)).toBeVisible();

  await page
    .getByRole('group', { name: RIDE_DETAIL_GROUP_TERMS.pickLegend })
    .getByRole('radio', { name: new RegExp(SLOW.name) })
    .check();
  await expect(register).toBeEnabled();
  await register.click();

  await expect(
    page.getByRole('heading', {
      name: RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle,
    }),
  ).toBeVisible();
  await expect(page.getByText(ridingIn(SLOW))).toBeVisible();
});

test('a registered rider changes their pace group', async ({ page }) => {
  const { rideId } = await createRideWithGroups();
  await signInParticipant(page.request);
  const { groups } = (await (
    await page.request.get(`/api/v1/rides/${rideId}`)
  ).json()) as { groups: Array<{ id: string; name: string }> };
  const slowId = groups.find((g) => g.name === SLOW.name)!.id;
  await registerForRide(page.request, rideId, slowId);

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByText(ridingIn(SLOW))).toBeVisible();

  await page
    .getByRole('button', { name: RIDE_DETAIL_GROUP_TERMS.changeGroup })
    .click();
  await page
    .getByRole('group', { name: RIDE_DETAIL_GROUP_TERMS.changeGroup })
    .getByRole('radio', { name: new RegExp(FAST.name) })
    .check();
  await page
    .getByRole('button', { name: RIDE_DETAIL_GROUP_TERMS.saveGroup })
    .click();

  await expect(
    page.getByText(RIDE_DETAIL_GROUP_TERMS.changeSuccess),
  ).toBeVisible();
  await expect(page.getByText(ridingIn(FAST))).toBeVisible();

  // Persisted server-side, not just local state.
  await page.reload();
  await expect(page.getByText(ridingIn(FAST))).toBeVisible();
});
