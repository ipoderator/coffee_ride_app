import type {
  AdminActionItem,
  AdminOverview,
  AdminReviewListItem,
  AdminRideListItem,
  AdminUserDetail,
  Paginated,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

// CR-231: admin API fixtures shared by the `features/admin/*` tests and the
// admin stories — one place that knows the contract's shape.

export function makeAdminUser(
  overrides: Partial<AdminUserDetail> = {},
): AdminUserDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'rider@example.com',
    displayName: 'Аня Петрова',
    emailVerified: true,
    createdAt: '2026-09-01T09:00:00.000Z',
    blockedAt: null,
    isOrganizer: false,
    isAdmin: false,
    firstName: 'Аня',
    lastName: 'Петрова',
    blockReason: null,
    organizer: null,
    activeSessions: 2,
    ridesOrganized: 0,
    activeRegistrations: 3,
    reviewsWritten: 1,
    ...overrides,
  };
}

export function makeAdminRide(
  overrides: Partial<AdminRideListItem> = {},
): AdminRideListItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Утренний круг по набережной',
    status: 'registration_open',
    startsAt: '2026-10-18T05:00:00.000Z',
    timezone: 'Europe/Moscow',
    createdAt: '2026-10-01T10:00:00.000Z',
    organizer: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Велоклуб «Рассвет»',
      userId: '44444444-4444-4444-8444-444444444444',
    },
    activeRegistrations: 12,
    hiddenAt: null,
    hiddenReason: null,
    ...overrides,
  };
}

export function makeAdminReview(
  overrides: Partial<AdminReviewListItem> = {},
): AdminReviewListItem {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    rating: 4,
    comment: 'Хороший темп, но долгая остановка на кофе.',
    createdAt: '2026-10-05T15:30:00.000Z',
    author: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'rider@example.com',
      displayName: 'Аня Петрова',
    },
    ride: {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Утренний круг по набережной',
    },
    hiddenAt: null,
    hiddenReason: null,
    ...overrides,
  };
}

export function makeAdminAction(
  overrides: Partial<AdminActionItem> = {},
): AdminActionItem {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    action: 'user_blocked',
    targetType: 'user',
    targetId: '11111111-1111-4111-8111-111111111111',
    targetLabel: 'rider@example.com',
    reason: 'Спам в отзывах',
    createdAt: '2026-10-09T19:05:00.000Z',
    admin: {
      id: '77777777-7777-4777-8777-777777777777',
      email: 'owner@example.com',
    },
    ...overrides,
  };
}

export function makeAdminOverview(): AdminOverview {
  return {
    users: { total: 1240, newLast7Days: 35, unverified: 18, blocked: 2 },
    organizers: { total: 41 },
    rides: {
      byStatus: {
        draft: 6,
        published: 3,
        registration_open: 14,
        registration_closed: 2,
        started: 1,
        finished: 210,
        cancelled: 9,
      },
      hidden: 1,
      upcomingNext7Days: 11,
    },
    registrations: { active: 320, newLast7Days: 64 },
    reviews: { total: 512, hidden: 3 },
    dependencies: {
      database: 'ok',
      redis: 'error',
      s3: 'ok',
      email: 'not_configured',
      maps: 'ok',
    },
  };
}

export function page<Item>(
  items: Item[],
  nextCursor: string | null = null,
): Paginated<Item> {
  return { items, nextCursor };
}

/** An `ApiError` as the admin client throws it for a problem response. */
export function adminProblem(status: number, code: string): ApiError {
  const problem: ProblemDetails = {
    type: `https://coffee-ride.example/errors/${code}`,
    title: 'Problem',
    status,
    detail: `English detail for ${code}.`,
    instance: '/v1/admin',
    code,
  };
  return new ApiError(problem);
}
