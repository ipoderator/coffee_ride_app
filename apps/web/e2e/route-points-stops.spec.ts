import { expect, test } from '@playwright/test';
import { ROUTE_POINT_TERMS, STOPS_TERMS } from 'ui';
import {
  createDraftRide,
  createOrganizerProfile,
  login,
  registerAndVerify,
} from './helpers/api-fixtures';

// CR-138. `StopsSection`/`RoutePointsSection` add/edit/delete — both are
// draft-only, server-ordered lists with no reorder UI
// (`.claude/context/current-task.md`'s scoping note in those components), so
// this only asserts the CRUD cycle, not any ordering behavior.

test('organizer adds, edits and deletes a stop', async ({ page }) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: остановки');
  const { rideId } = await createDraftRide(page.request, 'E2E остановки');

  await page.goto(`/organizer/rides/${rideId}/route`);
  await page.getByRole('button', { name: STOPS_TERMS.addButton }).click();
  await page.getByLabel(STOPS_TERMS.nameLabel).fill('Кофейня на набережной');
  await page.getByLabel(STOPS_TERMS.latLabel).fill('55.75');
  await page.getByLabel(STOPS_TERMS.lngLabel).fill('37.62');
  await page.getByRole('button', { name: STOPS_TERMS.save }).click();

  await expect(page.getByText(STOPS_TERMS.saveSuccess)).toBeVisible();
  const stopRow = page.getByText('Кофейня на набережной');
  await expect(stopRow).toBeVisible();

  await page.getByRole('button', { name: STOPS_TERMS.edit }).click();
  await page.getByLabel(STOPS_TERMS.nameLabel).fill('Кофейня у моста');
  await page.getByRole('button', { name: STOPS_TERMS.save }).click();
  await expect(page.getByText(STOPS_TERMS.saveSuccess)).toBeVisible();
  await expect(page.getByText('Кофейня у моста')).toBeVisible();

  // CR-200 (KI-087): the app's own dialog, not a native confirm().
  await page.getByRole('button', { name: STOPS_TERMS.delete }).click();
  await page
    .getByRole('dialog', { name: STOPS_TERMS.deleteConfirmTitle })
    .getByRole('button', { name: STOPS_TERMS.delete })
    .click();
  await expect(page.getByText(STOPS_TERMS.deleteSuccess)).toBeVisible();
  await expect(page.getByText(STOPS_TERMS.emptyTitle)).toBeVisible();
});

test('organizer adds, edits and deletes a route point', async ({ page }) => {
  const organizer = await registerAndVerify(page.request);
  await login(page.request, organizer.email, organizer.password);
  await createOrganizerProfile(page.request, 'Клуб e2e: точки маршрута');
  const { rideId } = await createDraftRide(page.request, 'E2E точки маршрута');

  await page.goto(`/organizer/rides/${rideId}/route`);
  await page.getByRole('button', { name: ROUTE_POINT_TERMS.addButton }).click();
  await page.getByLabel(ROUTE_POINT_TERMS.labelLabel).fill('Смотровая точка');
  await page.getByLabel(ROUTE_POINT_TERMS.latLabel).fill('55.8');
  await page.getByLabel(ROUTE_POINT_TERMS.lngLabel).fill('37.65');
  await page.getByRole('button', { name: ROUTE_POINT_TERMS.save }).click();

  await expect(page.getByText(ROUTE_POINT_TERMS.saveSuccess)).toBeVisible();
  await expect(page.getByText('Смотровая точка')).toBeVisible();

  await page.getByRole('button', { name: ROUTE_POINT_TERMS.edit }).click();
  await page
    .getByLabel(ROUTE_POINT_TERMS.labelLabel)
    .fill('Смотровая площадка');
  await page.getByRole('button', { name: ROUTE_POINT_TERMS.save }).click();
  await expect(page.getByText(ROUTE_POINT_TERMS.saveSuccess)).toBeVisible();
  await expect(page.getByText('Смотровая площадка')).toBeVisible();

  await page.getByRole('button', { name: ROUTE_POINT_TERMS.delete }).click();
  await page
    .getByRole('dialog', { name: ROUTE_POINT_TERMS.deleteConfirmTitle })
    .getByRole('button', { name: ROUTE_POINT_TERMS.delete })
    .click();
  await expect(page.getByText(ROUTE_POINT_TERMS.deleteSuccess)).toBeVisible();
  await expect(page.getByText(ROUTE_POINT_TERMS.emptyTitle)).toBeVisible();
});
