import { expect, test } from '@playwright/test';
import { AUTH_TERMS, REGISTRATION_ACTION_TERMS, VERIFY_EMAIL_TERMS } from 'ui';
import {
  createOrganizerProfile,
  createPublishedRide,
  E2E_PASSWORD,
  login,
  registerAndVerify,
  uniqueEmail,
} from './helpers/api-fixtures';
import { newIsolatedRequest, WEB_BASE_URL } from './helpers/ui';

// CR-141 (KI-064): an anonymous visitor's «Зарегистрироваться» used to send
// them to a bare `/login` — after signing in they landed on `/me` and had to
// find the ride again. The tested journey: ride → sign in → back on the same
// ride → register. The open-redirect cases live in `next-path.test.ts`.
test('an anonymous «Зарегистрироваться» returns to the ride after sign-in', async ({
  page,
}) => {
  // Fixtures on isolated contexts: `page` must stay anonymous until the UI
  // sign-in the test is about.
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(organizerRequest, 'Клуб для e2e-теста входа');
  const rideTitle = `E2E возврат после входа ${Date.now()}`;
  const { rideId } = await createPublishedRide(organizerRequest, rideTitle);
  await organizerRequest.dispose();

  const participantRequest = await newIsolatedRequest();
  const participant = await registerAndVerify(participantRequest);
  await participantRequest.dispose();

  const next = encodeURIComponent(`/rides/${rideId}`);

  await page.goto(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();

  await page.waitForURL(`/login?next=${next}`);
  // «Нет аккаунта?» keeps the return target too.
  await expect(
    page.getByRole('link', { name: AUTH_TERMS.registerLink }),
  ).toHaveAttribute('href', `/register?next=${next}`);

  await page.getByLabel(AUTH_TERMS.emailLabel).fill(participant.email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(participant.password);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();

  await page.waitForURL(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();
  await expect(
    page.getByRole('button', { name: REGISTRATION_ACTION_TERMS.cancel }),
  ).toBeVisible();
});

// CR-197 (QA `fe0b4c2`): a new account made from a ride. Registering doesn't
// sign in, so `next` has to survive register → verify email → «Перейти ко
// входу» → sign in; the verification link used to drop it and the visitor
// landed on `/me`. Uses the register screen's dev-only verification link —
// the same token the email carries.
test('a new account made from a ride returns to it after email verification and sign-in', async ({
  page,
}) => {
  const organizerRequest = await newIsolatedRequest();
  const organizer = await registerAndVerify(organizerRequest);
  await login(organizerRequest, organizer.email, organizer.password);
  await createOrganizerProfile(
    organizerRequest,
    'Клуб для e2e-теста регистрации',
  );
  const rideTitle = `E2E возврат после регистрации ${Date.now()}`;
  const { rideId } = await createPublishedRide(organizerRequest, rideTitle);
  await organizerRequest.dispose();

  const email = uniqueEmail();
  const next = encodeURIComponent(`/rides/${rideId}`);

  await page.goto(`/rides/${rideId}`);
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();
  await page.waitForURL(`/login?next=${next}`);
  await page.getByRole('link', { name: AUTH_TERMS.registerLink }).click();
  await page.waitForURL(`/register?next=${next}`);

  await page.getByLabel(AUTH_TERMS.emailLabel).fill(email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: AUTH_TERMS.registerSubmit }).click();
  await expect(
    page.getByRole('heading', { name: AUTH_TERMS.registerSuccessTitle }),
  ).toBeVisible();

  const verifyLink = page.getByRole('link', {
    name: /^\/verify-email\?token=/,
  });
  await expect(verifyLink).toHaveAttribute(
    'href',
    new RegExp(`^/verify-email\\?token=[^&]+&next=${next}$`),
  );
  await verifyLink.click();

  await expect(
    page.getByRole('heading', { name: VERIFY_EMAIL_TERMS.successTitle }),
  ).toBeVisible();
  const toLogin = page.getByRole('link', {
    name: VERIFY_EMAIL_TERMS.loginLink,
  });
  await expect(toLogin).toHaveAttribute('href', `/login?next=${next}`);
  await toLogin.click();
  await page.waitForURL(`/login?next=${next}`);

  await page.getByLabel(AUTH_TERMS.emailLabel).fill(email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();

  await page.waitForURL(`/rides/${rideId}`);
  await expect(page.getByRole('heading', { name: rideTitle })).toBeVisible();
  await page
    .getByRole('button', { name: REGISTRATION_ACTION_TERMS.register })
    .click();
  await expect(
    page.getByRole('button', { name: REGISTRATION_ACTION_TERMS.cancel }),
  ).toBeVisible();
});

// CR-197: a crafted verification link can't turn «Перейти ко входу» into an
// open redirect — an external `next` is dropped before it reaches the link.
test('the verification page drops an external `next`', async ({ page }) => {
  const request = await newIsolatedRequest();
  const register = await request.post('/api/v1/auth/register', {
    headers: { Origin: WEB_BASE_URL },
    data: { email: uniqueEmail(), password: E2E_PASSWORD },
  });
  expect(register.ok()).toBe(true);
  const { verificationUrl } = (await register.json()) as {
    verificationUrl: string;
  };
  await request.dispose();
  const token = new URL(verificationUrl, WEB_BASE_URL).searchParams.get(
    'token',
  );

  await page.goto(
    `/verify-email?token=${token}&next=${encodeURIComponent('https://evil.example/rides')}`,
  );
  await expect(
    page.getByRole('link', { name: VERIFY_EMAIL_TERMS.loginLink }),
  ).toHaveAttribute('href', '/login');
});

// QA live audit 2026-10-08, item 3: a guest opening a protected cabinet page
// was sent to a bare `/login` and, signed in, landed on `/me`.
test('a guest sent to sign in from a cabinet page returns to it', async ({
  page,
}) => {
  const request = await newIsolatedRequest();
  const account = await registerAndVerify(request);
  await request.dispose();

  await page.goto('/me/rides?tab=history');
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent('/me/rides?tab=history')}`,
  );

  await page.getByLabel(AUTH_TERMS.emailLabel).fill(account.email);
  await page.getByLabel(AUTH_TERMS.passwordLabel).fill(account.password);
  await page.getByRole('button', { name: AUTH_TERMS.loginSubmit }).click();
  await expect(page).toHaveURL('/me/rides?tab=history');
});
