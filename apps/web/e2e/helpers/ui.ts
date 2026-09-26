import {
  expect,
  request as apiRequest,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { AUTH_TERMS } from 'ui';
import { login, registerAndVerify } from './api-fixtures';

// CR-135: shared by every spec that drives more than one actor. Moved here
// from critical-journeys.spec.ts (CR-092), unchanged.

export const WEB_BASE_URL = 'http://localhost:3000';

export async function loginViaUi(page: Page, email: string, password: string) {
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
// create one. Used for a second actor whose session must never leak into
// `page`'s own.
export function newIsolatedRequest() {
  return apiRequest.newContext({ baseURL: WEB_BASE_URL });
}

export interface Actor {
  context: BrowserContext;
  page: Page;
  email: string;
  password: string;
  userId: string;
}

/**
 * A second (third, …) signed-in browser user in its own context. Signed in via
 * the API — `context.request` shares the context's cookie jar, so `page` is
 * signed in too. Callers close `context` when done.
 */
export async function newSignedInActor(browser: Browser): Promise<Actor> {
  const context = await browser.newContext({ baseURL: WEB_BASE_URL });
  const account = await registerAndVerify(context.request);
  await login(context.request, account.email, account.password);
  const page = await context.newPage();
  return { context, page, ...account };
}

/** `ConfirmDialog` (packages/ui) → its confirm button. */
export async function confirmInDialog(page: Page, confirmLabel: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
}
