import { expect } from 'storybook/test';
import type { AdminActionItem } from 'types';
import {
  makeAdminAction,
  makeAdminReview,
  makeAdminRide,
  makeAdminUser,
} from '@/test-support/admin';

// CR-231: the admin stories' API stub — `/api/v1/admin/*` answered by the
// story's handler, everything else passes through.

export type AdminHandler = (
  path: string,
  init: RequestInit | undefined,
) => Promise<Response> | Response | undefined;

export function stubAdmin(handler: AdminHandler) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      const prefix = '/api/v1/admin';
      if (!url.pathname.startsWith(prefix)) return original(input, init);
      const answer = await handler(
        `${url.pathname.slice(prefix.length)}${url.search}`,
        init,
      );
      return answer ?? json({ code: 'not_found' }, 404);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function problem(status: number, code: string): Response {
  return json(
    {
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Problem',
      status,
      detail: 'English detail the admin must never see.',
      instance: '/v1/admin',
      code,
    },
    status,
  );
}

/** A request that never answers — the loading state stays on screen. */
export const pending = () => new Promise<Response>(() => {});

export const USERS = [
  makeAdminUser(),
  makeAdminUser({
    id: '44444444-4444-4444-8444-444444444444',
    email: 'rassvet.club@example.com',
    displayName: 'Велоклуб «Рассвет»',
    isOrganizer: true,
    createdAt: '2026-08-14T07:20:00.000Z',
  }),
  makeAdminUser({
    id: '88888888-8888-4888-8888-888888888888',
    email: 'spam.bot.2026@example.com',
    displayName: null,
    emailVerified: false,
    blockedAt: '2026-10-09T19:05:00.000Z',
    blockReason: 'Спам в отзывах',
    createdAt: '2026-10-08T23:41:00.000Z',
  }),
  makeAdminUser({
    id: '77777777-7777-4777-8777-777777777777',
    email: 'owner@example.com',
    displayName: 'Глеб',
    isAdmin: true,
    isOrganizer: true,
    createdAt: '2026-06-01T10:00:00.000Z',
  }),
];

export const RIDES = [
  makeAdminRide(),
  makeAdminRide({
    id: 'r-hidden',
    title: 'Гравийная сотка — распродажа велосипедов, пишите в личку',
    status: 'published',
    startsAt: '2026-10-25T04:00:00.000Z',
    activeRegistrations: 0,
    hiddenAt: '2026-10-09T18:00:00.000Z',
    hiddenReason: 'Реклама вместо заезда',
  }),
  makeAdminRide({
    id: 'r-draft',
    title: 'Ночной Садовое кольцо',
    status: 'draft',
    startsAt: '2026-11-01T18:00:00.000Z',
    activeRegistrations: 0,
  }),
  makeAdminRide({
    id: 'r-finished',
    title: 'Кофе-райд в Новосибирске',
    status: 'finished',
    startsAt: '2026-09-20T03:00:00.000Z',
    timezone: 'Asia/Novosibirsk',
    activeRegistrations: 24,
  }),
];

export const REVIEWS = [
  makeAdminReview(),
  makeAdminReview({
    id: 'v-hidden',
    rating: 1,
    comment: 'Организаторы — ******, никогда не ездите с ними!!!',
    author: {
      id: '88888888-8888-4888-8888-888888888888',
      email: 'spam.bot.2026@example.com',
      displayName: null,
    },
    hiddenAt: '2026-10-09T19:00:00.000Z',
    hiddenReason: 'Оскорбления',
  }),
  makeAdminReview({ id: 'v-empty', rating: 5, comment: null }),
];

export const ACTIONS: AdminActionItem[] = [
  makeAdminAction(),
  makeAdminAction({
    id: 'act-2',
    action: 'review_hidden',
    targetType: 'review',
    targetLabel: 'Утренний круг по набережной',
    reason: 'Оскорбления',
    createdAt: '2026-10-09T19:00:00.000Z',
  }),
  makeAdminAction({
    id: 'act-3',
    action: 'ride_hidden',
    targetType: 'ride',
    targetLabel: 'Гравийная сотка — распродажа велосипедов, пишите в личку',
    reason: 'Реклама вместо заезда',
    createdAt: '2026-10-09T18:00:00.000Z',
  }),
  makeAdminAction({
    id: 'act-4',
    action: 'user_email_verified',
    targetLabel: 'rassvet.club@example.com',
    targetId: '44444444-4444-4444-8444-444444444444',
    reason: null,
    createdAt: '2026-10-08T12:30:00.000Z',
  }),
  makeAdminAction({
    id: 'act-5',
    action: 'admin_granted',
    targetLabel: 'owner@example.com',
    targetId: '77777777-7777-4777-8777-777777777777',
    reason: null,
    admin: null,
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  makeAdminAction({
    id: 'act-6',
    action: 'ride_cancelled',
    targetType: 'ride',
    targetId: '66666666-6666-4666-8666-666666666666',
    targetLabel: null,
    reason: 'Организатор не выходит на связь',
    createdAt: '2026-10-07T16:45:00.000Z',
  }),
];

// CR-232: unbroken values long enough to overflow any dialog unless they wrap.
export const LONG_EMAIL = `${'velosiped.ochen.dlinnyi.adres.'.repeat(3)}x@very-long-cycling-club-domain.example.com`;
export const LONG_TITLE = `Гравийная-сотка-${'по-лесным-дорогам-и-полям-'.repeat(5)}финиш`;
export const LONG_COMMENT = `${'Очень длинный отзыв без единого разрыва строки, '.repeat(12)}конец.`;

/** Neither the dialog panel nor the page scrolls sideways. */
export async function expectNoSideScroll(dialog: HTMLElement) {
  await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
}
