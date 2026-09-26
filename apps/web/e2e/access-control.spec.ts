import { expect, test, type APIRequestContext } from '@playwright/test';
import { PARTICIPANTS_TERMS, RIDE_EDIT_TERMS } from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  login,
  registerAndVerify,
  registerForRide,
  unsafeRequest,
  updateMe,
} from './helpers/api-fixtures';
import { newIsolatedRequest } from './helpers/ui';

// CR-135. `.claude/rules/security.md` → Authorization, end to end: a signed-in
// user who doesn't own a ride can't change it, can't read or manage its
// participants, and never sees another rider's private contact data — checked
// at the API (the actual guard) and through the organizer screens a curious
// participant can type into the address bar.

const VICTIM_NAME = 'Е2Е Приватный';
const VICTIM_PHONE = '+7 999 123-45-67';

interface Fixture {
  rideId: string;
  rideTitle: string;
  organizerRequest: APIRequestContext;
  victimEmail: string;
}

async function setUp(): Promise<Fixture> {
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб e2e: доступ');
  const rideTitle = `E2E доступ ${Date.now()}`;
  const { rideId } = await createPublishedRide(organizerRequest, rideTitle);

  const victimRequest = await newIsolatedRequest();
  const victim = await registerAndVerify(victimRequest);
  await login(victimRequest, victim.email, victim.password);
  await updateMe(victimRequest, {
    displayName: VICTIM_NAME,
    phone: VICTIM_PHONE,
  });
  // The contact data is real — so the "no leak" checks below prove the reads
  // withheld it, not that there was none to leak.
  expect(await (await victimRequest.get('/api/v1/auth/me')).text()).toContain(
    VICTIM_PHONE,
  );
  await registerForRide(victimRequest, rideId);
  await victimRequest.dispose();

  return { rideId, rideTitle, organizerRequest, victimEmail: victim.email };
}

async function expectRideUnchanged(fixture: Fixture) {
  const response = await fixture.organizerRequest.get(
    `/api/v1/rides/${fixture.rideId}`,
  );
  const body = (await response.json()) as {
    ride: { title: string; status: string };
    groups: unknown[];
  };
  expect(body.ride).toMatchObject({
    title: fixture.rideTitle,
    status: 'registration_open',
  });
  expect(body.groups).toEqual([]);
}

// Both kinds of non-owner: a plain participant, and an organizer of a
// *different* club (organizer capability is per-resource, not a role).
for (const kind of ['participant', 'other organizer'] as const) {
  const who =
    kind === 'participant' ? 'a participant' : "another club's organizer";
  test(`${who} can't change someone else's ride or read its participants`, async ({
    page,
  }) => {
    const fixture = await setUp();
    const intruder = await registerAndVerify(page.request);
    await login(page.request, intruder.email, intruder.password);
    if (kind === 'other organizer') {
      await createOrganizerProfile(page.request, 'Чужой клуб e2e');
    }

    const base = `/api/v1/rides/${fixture.rideId}`;
    const attempts = [
      unsafeRequest(page.request, 'patch', base, { title: 'Взлом' }),
      unsafeRequest(page.request, 'post', `${base}/close-registration`),
      unsafeRequest(page.request, 'post', `${base}/cancel`),
      unsafeRequest(page.request, 'post', `${base}/updates`, {
        message: 'Чужое обновление',
      }),
      unsafeRequest(page.request, 'post', `${base}/groups`, {
        name: 'Чужая группа',
        paceKmh: 30,
      }),
      page.request.get(`${base}/participants`),
      page.request.get(`${base}/waitlist`),
      page.request.get(`${base}/updates`),
    ];
    for (const response of await Promise.all(attempts)) {
      expect([403, 404], `${response.url()} → ${response.status()}`).toContain(
        response.status(),
      );
    }
    await expectRideUnchanged(fixture);

    // The participants screen: both lists (riders + waitlist) end in an error
    // state, never the data.
    await page.goto(`/organizer/rides/${fixture.rideId}/participants`);
    await expect(page.getByText(PARTICIPANTS_TERMS.loadError)).toHaveCount(2);
    await expect(page.getByText(VICTIM_NAME)).toHaveCount(0);

    // The edit screen. KI-069: it loads through the public ride read, so a
    // non-owner may still be shown the lifecycle buttons — if so, pressing one
    // must fail server-side and leave the ride as it was.
    await page.goto(`/organizer/rides/${fixture.rideId}/edit`);
    const close = page.getByRole('button', {
      name: RIDE_EDIT_TERMS.closeRegistration,
    });
    const notFound = page.getByRole('heading', {
      name: RIDE_EDIT_TERMS.notFoundTitle,
    });
    await expect(close.or(notFound)).toBeVisible();
    if (await close.isVisible()) {
      await close.click();
      await expect(page.getByText(RIDE_EDIT_TERMS.loadError)).toBeVisible();
      await expect(
        page.getByText(RIDE_EDIT_TERMS.closeRegistrationSuccess),
      ).toHaveCount(0);
    }
    await expectRideUnchanged(fixture);

    await fixture.organizerRequest.dispose();
  });
}

test("no public or rider-facing read exposes another rider's contacts", async ({
  page,
}) => {
  const fixture = await setUp();
  const viewer = await registerAndVerify(page.request);
  await login(page.request, viewer.email, viewer.password);
  // A co-rider: the widest non-owner access the riders list grants.
  await registerForRide(page.request, fixture.rideId);

  const base = `/api/v1/rides/${fixture.rideId}`;
  const riders = await page.request.get(`${base}/riders`);
  expect(riders.status()).toBe(200);
  const ridersBody = await riders.text();
  // Listed by name — so the check below is about the contacts, not absence.
  expect(ridersBody).toContain(VICTIM_NAME);

  for (const response of [riders, await page.request.get(base)]) {
    const body = await response.text();
    expect(body).not.toContain(fixture.victimEmail);
    expect(body).not.toContain(VICTIM_PHONE);
  }

  await fixture.organizerRequest.dispose();
});
