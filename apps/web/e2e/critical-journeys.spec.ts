import {
  expect,
  request as apiRequest,
  test,
  type Page,
} from '@playwright/test';
import {
  AUTH_TERMS,
  PARTICIPANTS_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_CREATE_TERMS,
  RIDE_EDIT_TERMS,
} from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  E2E_PASSWORD,
  login,
  registerAndVerify,
  registerForRide,
  setDisplayName,
  uniqueEmail,
} from './helpers/api-fixtures';

// CR-092. The three critical journeys `.claude/rules/testing.md` names, which
// `home.spec.ts`'s single-page smoke check deliberately doesn't cover.
// Serial, in one file: `/v1/auth/register` and `/v1/auth/login` each have
// their own 5/min/IP in-memory rate-limit tier (KI-014's interim tier) —
// running these three specs as one serial group, not `fullyParallel` across
// separate files/workers, keeps every run's call burst naturally spread out.
// Each fixture helper call below is deliberately the minimum needed per
// identity (no redundant re-login of an identity already sharing `page`'s
// cookie jar) to stay at exactly 5 register calls and 5 login calls total
// across the whole group, not more.
test.describe.configure({ mode: 'serial' });

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(AUTH_TERMS.emailLabel).fill(email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(password);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();
  // `LoginForm.handleSubmit` awaits the login fetch before its
  // `router.replace('/me')` — without waiting for that navigation here, a
  // subsequent `page.goto(...)` in the caller races it and can cancel the
  // in-flight request, leaving no session cookie set at all.
  await page.waitForURL('/me');
}

// A fresh, independent cookie jar — `apiRequest` (the module-level `APIRequest`,
// distinct from the per-test `request`/`page.request` fixtures) is what can
// create one. Used for a second actor (e.g. the organizer fixture in the
// participant journey below) whose session must never leak into `page`'s own.
function newIsolatedRequest() {
  return apiRequest.newContext({ baseURL: 'http://localhost:3000' });
}

test('participant discovers a ride and registers for it', async ({ page }) => {
  // Fixture: an organizer, on a separate context so its session never touches
  // the browser's own — the tested journey is the participant's, not theirs.
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб для e2e-теста');
  const rideTitle = `E2E заезд ${Date.now()}`;
  const { rideId } = await createPublishedRide(organizerRequest, rideTitle);
  await organizerRequest.dispose();

  // Fixture: a registered/verified participant account (no UI verify-email
  // screen exists, KI-026 — this is the only way to get a usable account).
  const participant = await registerAndVerify(page.request);

  // Tested journey starts here: log in, discover the ride, register.
  await loginViaUi(page, participant.email, participant.password);
  await page.goto('/');
  await page.locator(`a[href="/rides/${rideId}"]`).click();
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();

  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();
  await expect(
    page.getByRole('button', { name: REGISTRATION_ACTION_TERMS.cancel }),
  ).toBeVisible();
});

test('organizer creates and publishes a ride', async ({ page }) => {
  const organizer = await registerAndVerify(page.request);
  await loginViaUi(page, organizer.email, organizer.password);
  // `page.request` shares its cookie jar with the browser context (Playwright
  // docs) — the session the UI login above just set is usable here too.
  await createOrganizerProfile(page.request, 'Клуб для e2e-теста 2');

  await page.goto('/organizer/rides/new');
  const rideTitle = `E2E заезд ${Date.now()}`;
  await page.getByLabel(RIDE_CREATE_TERMS.titleLabel).fill(rideTitle);
  await page
    .getByLabel(RIDE_CREATE_TERMS.startsAtLabel)
    .fill(
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16),
    );
  await page.getByRole('button', { name: RIDE_CREATE_TERMS.submit }).click();
  await expect(
    page.getByRole('heading', { name: RIDE_CREATE_TERMS.successTitle }),
  ).toBeVisible();

  await page
    .getByRole('link', { name: RIDE_CREATE_TERMS.editRideLink })
    .click();
  await expect(
    page.getByRole('heading', { name: RIDE_EDIT_TERMS.pageTitle }),
  ).toBeVisible();

  await page.getByRole('button', { name: RIDE_EDIT_TERMS.publish }).click();
  await expect(page.getByText(RIDE_EDIT_TERMS.publishSuccess)).toBeVisible();

  await page
    .getByRole('button', { name: RIDE_EDIT_TERMS.openRegistration })
    .click();
  await expect(
    page.getByText(RIDE_EDIT_TERMS.openRegistrationSuccess),
  ).toBeVisible();
});

test('organizer views registered participants', async ({ page }) => {
  // Organizer identity lives entirely on `page.request` (shares its cookie
  // jar with `page`, `.claude/context/...`'s note in the helper) — no
  // separate UI login needed here, that journey is already covered by
  // "organizer creates and publishes a ride" above. Keeps this spec's login
  // count down too: `/v1/auth/login` shares CR-011's 5/min/IP rate limit
  // tier across the whole serial group (see the file-level comment).
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб для e2e-теста 3');
  const { rideId } = await createPublishedRide(
    page.request,
    `E2E заезд ${Date.now()}`,
  );

  // Fixture: a participant who has actually registered — the state this
  // journey is about *viewing*, not creating. Isolated context: this
  // session must never overwrite the organizer's cookie shared with `page`.
  const participantEmail = uniqueEmail();
  const participantRequest = await newIsolatedRequest();
  const participant = await registerAndVerify(
    participantRequest,
    participantEmail,
    E2E_PASSWORD,
  );
  await login(participantRequest, participant.email, participant.password);
  await setDisplayName(participantRequest, 'Е2Е Участник');
  await registerForRide(participantRequest, rideId);
  await participantRequest.dispose();

  await page.goto(`/organizer/rides/${rideId}/participants`);

  await expect(
    page.getByRole('heading', { name: PARTICIPANTS_TERMS.pageTitle }),
  ).toBeVisible();
  await expect(page.getByText('Е2Е Участник')).toBeVisible();
});
