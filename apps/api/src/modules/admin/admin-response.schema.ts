import { z } from 'zod';
import {
  RIDE_STATUSES,
  adminActionTypeValues,
  adminTargetTypeValues,
} from 'types';

// CR-229 (ADR-032): response serialization schemas for `/v1/admin/*` — the same
// "the response schema is the allowlist" role as the other modules' ones: a field
// not named here never leaves the API, whatever the service returns.

const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

const dependencyStatus = z.enum(['ok', 'error', 'not_configured']);
const configuredStatus = z.enum(['ok', 'not_configured']);

export const adminMeResponseSchema = z.object({
  admin: z.object({ userId: z.string(), email: z.string() }),
});

export const adminOverviewResponseSchema = z.object({
  overview: z.object({
    users: z.object({
      total: z.number(),
      newLast7Days: z.number(),
      unverified: z.number(),
      blocked: z.number(),
    }),
    organizers: z.object({ total: z.number() }),
    rides: z.object({
      byStatus: z.record(z.enum(RIDE_STATUSES), z.number()),
      hidden: z.number(),
      upcomingNext7Days: z.number(),
    }),
    registrations: z.object({
      active: z.number(),
      newLast7Days: z.number(),
    }),
    reviews: z.object({ total: z.number(), hidden: z.number() }),
    dependencies: z.object({
      database: dependencyStatus,
      redis: dependencyStatus,
      s3: dependencyStatus,
      email: configuredStatus,
      maps: configuredStatus,
    }),
  }),
});

const userListItem = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  blockedAt: z.string().nullable(),
  isOrganizer: z.boolean(),
  isAdmin: z.boolean(),
});

export const adminUsersResponseSchema = page(userListItem);

export const adminUserResponseSchema = z.object({
  user: userListItem.extend({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    blockReason: z.string().nullable(),
    organizer: z.object({ id: z.string(), name: z.string() }).nullable(),
    activeSessions: z.number(),
    ridesOrganized: z.number(),
    activeRegistrations: z.number(),
    reviewsWritten: z.number(),
  }),
});

export const adminRevokeSessionsResponseSchema = z.object({
  revoked: z.number(),
});

const rideItem = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(RIDE_STATUSES),
  startsAt: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
  organizer: z.object({ id: z.string(), name: z.string(), userId: z.string() }),
  activeRegistrations: z.number(),
  hiddenAt: z.string().nullable(),
  hiddenReason: z.string().nullable(),
});

export const adminRidesResponseSchema = page(rideItem);
export const adminRideResponseSchema = z.object({ ride: rideItem });

const reviewItem = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string(),
  author: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
  }),
  ride: z.object({ id: z.string(), title: z.string() }),
  hiddenAt: z.string().nullable(),
  hiddenReason: z.string().nullable(),
});

export const adminReviewsResponseSchema = page(reviewItem);
export const adminReviewResponseSchema = z.object({ review: reviewItem });

export const adminActionsResponseSchema = page(
  z.object({
    id: z.string(),
    action: z.enum(adminActionTypeValues),
    targetType: z.enum(adminTargetTypeValues),
    targetId: z.string(),
    targetLabel: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
    admin: z.object({ id: z.string(), email: z.string() }).nullable(),
  }),
);
