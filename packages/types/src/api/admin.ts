import { z } from 'zod';
import type { RideStatus } from '../domain/ride.js';
import type { Paginated } from './pagination.js';

// CR-228..CR-230 (ADR-032): the `/v1/admin/*` contract. Only an admin
// (`platform_admins`) ever reaches these endpoints — everyone else gets `404`.

const adminPageQuery = {
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
};

// Free-text search box: trimmed, empty means "no filter".
const searchQuery = z
  .string()
  .trim()
  .max(200, 'q must be at most 200 characters.')
  .optional()
  .transform((value) => (value ? value : undefined));

/** A block/hide/cancel reason — required, shown to the admin in the log. */
export const adminReasonRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'reason is required.')
    .max(500, 'reason must be at most 500 characters.'),
});
export type AdminReasonRequest = z.infer<typeof adminReasonRequestSchema>;

export interface AdminMeResponse {
  admin: { userId: string; email: string };
}

// ── Overview ────────────────────────────────────────────────────────────

export type AdminDependencyStatus = 'ok' | 'error' | 'not_configured';

export interface AdminOverview {
  users: {
    total: number;
    newLast7Days: number;
    unverified: number;
    blocked: number;
  };
  organizers: { total: number };
  rides: {
    byStatus: Record<RideStatus, number>;
    hidden: number;
    upcomingNext7Days: number;
  };
  registrations: { active: number; newLast7Days: number };
  reviews: { total: number; hidden: number };
  dependencies: {
    database: AdminDependencyStatus;
    redis: AdminDependencyStatus;
    s3: AdminDependencyStatus;
    email: Exclude<AdminDependencyStatus, 'error'>;
    maps: Exclude<AdminDependencyStatus, 'error'>;
  };
}
export interface GetAdminOverviewResponse {
  overview: AdminOverview;
}

// ── Users ───────────────────────────────────────────────────────────────

export const adminUserFilterValues = [
  'all',
  'unverified',
  'blocked',
  'organizers',
] as const;
export type AdminUserFilter = (typeof adminUserFilterValues)[number];

export const listAdminUsersQuerySchema = z.object({
  ...adminPageQuery,
  q: searchQuery,
  filter: z.enum(adminUserFilterValues).optional(),
});
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  blockedAt: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
}
export type ListAdminUsersResponse = Paginated<AdminUserListItem>;

export interface AdminUserDetail extends AdminUserListItem {
  firstName: string | null;
  lastName: string | null;
  blockReason: string | null;
  organizer: { id: string; name: string } | null;
  activeSessions: number;
  ridesOrganized: number;
  activeRegistrations: number;
  reviewsWritten: number;
}
export interface GetAdminUserResponse {
  user: AdminUserDetail;
}

export interface RevokeAdminUserSessionsResponse {
  revoked: number;
}

// ── Rides ───────────────────────────────────────────────────────────────

export const adminRideVisibilityValues = ['all', 'visible', 'hidden'] as const;

export const listAdminRidesQuerySchema = z.object({
  ...adminPageQuery,
  q: searchQuery,
  status: z
    .enum([
      'draft',
      'published',
      'registration_open',
      'registration_closed',
      'started',
      'finished',
      'cancelled',
    ])
    .optional(),
  visibility: z.enum(adminRideVisibilityValues).optional(),
});
export type ListAdminRidesQuery = z.infer<typeof listAdminRidesQuerySchema>;

export interface AdminRideListItem {
  id: string;
  title: string;
  status: RideStatus;
  startsAt: string;
  timezone: string;
  createdAt: string;
  organizer: { id: string; name: string; userId: string };
  activeRegistrations: number;
  hiddenAt: string | null;
  hiddenReason: string | null;
}
export type ListAdminRidesResponse = Paginated<AdminRideListItem>;
export interface AdminRideResponse {
  ride: AdminRideListItem;
}

// ── Reviews ─────────────────────────────────────────────────────────────

export const listAdminReviewsQuerySchema = z.object({
  ...adminPageQuery,
  visibility: z.enum(adminRideVisibilityValues).optional(),
});
export type ListAdminReviewsQuery = z.infer<typeof listAdminReviewsQuerySchema>;

export interface AdminReviewListItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { id: string; email: string; displayName: string | null };
  ride: { id: string; title: string };
  hiddenAt: string | null;
  hiddenReason: string | null;
}
export type ListAdminReviewsResponse = Paginated<AdminReviewListItem>;
export interface AdminReviewResponse {
  review: AdminReviewListItem;
}

// ── Action log ──────────────────────────────────────────────────────────

export const adminActionTypeValues = [
  'admin_granted',
  'admin_revoked',
  'user_email_verified',
  'user_verification_resent',
  'user_sessions_revoked',
  'user_blocked',
  'user_unblocked',
  'ride_hidden',
  'ride_unhidden',
  'ride_cancelled',
  'review_hidden',
  'review_unhidden',
] as const;
export type AdminActionType = (typeof adminActionTypeValues)[number];

export const adminTargetTypeValues = ['user', 'ride', 'review'] as const;
export type AdminTargetType = (typeof adminTargetTypeValues)[number];

export const listAdminActionsQuerySchema = z.object({
  ...adminPageQuery,
  targetType: z.enum(adminTargetTypeValues).optional(),
  targetId: z.uuid('targetId must be a valid id.').optional(),
  // CR-232: additive — «Журнал» filters by action type.
  action: z.enum(adminActionTypeValues).optional(),
});
export type ListAdminActionsQuery = z.infer<typeof listAdminActionsQuerySchema>;

export interface AdminActionItem {
  id: string;
  action: AdminActionType;
  targetType: AdminTargetType;
  targetId: string;
  /** The target's current email/title, `null` when it no longer exists. */
  targetLabel: string | null;
  reason: string | null;
  createdAt: string;
  /** `null` for a grant/revoke run from the host CLI. */
  admin: { id: string; email: string } | null;
}
export type ListAdminActionsResponse = Paginated<AdminActionItem>;
