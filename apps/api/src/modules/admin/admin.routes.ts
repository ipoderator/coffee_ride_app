import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  adminReasonRequestSchema,
  listAdminActionsQuerySchema,
  listAdminReviewsQuerySchema,
  listAdminRidesQuerySchema,
  listAdminUsersQuerySchema,
} from 'types';
import type { Env } from '../../env.js';
import { requireAdmin, requireAuth } from '../../plugins/auth.js';
import { sendVerificationEmail } from '../notifications/notifications.service.js';
import { listAdminActions } from './admin-actions.service.js';
import { getAdminOverview } from './admin-overview.service.js';
import {
  adminActionsResponseSchema,
  adminMeResponseSchema,
  adminOverviewResponseSchema,
  adminReviewResponseSchema,
  adminReviewsResponseSchema,
  adminRevokeSessionsResponseSchema,
  adminRideResponseSchema,
  adminRidesResponseSchema,
  adminUserResponseSchema,
  adminUsersResponseSchema,
} from './admin-response.schema.js';
import {
  adminSetReviewHidden,
  listAdminReviews,
} from './admin-reviews.service.js';
import {
  adminCancelRide,
  adminSetRideHidden,
  listAdminRides,
} from './admin-rides.service.js';
import {
  adminBlockUser,
  adminIssueVerificationLink,
  adminRevokeUserSessions,
  adminUnblockUser,
  adminVerifyUserEmail,
  getAdminUser,
  listAdminUsers,
} from './admin-users.service.js';

const idParams = z.object({ id: z.uuid('id must be a valid id.') });

/**
 * CR-229/CR-230 (ADR-032): `/v1/admin/*`. Every route — registered through the
 * hook below, so none can be added without it — runs `requireAuth` then
 * `requireAdmin`: 401 without a session, 404 for a signed-in non-admin. The acting
 * admin is always `request.user`, never a body field. Unsafe methods also pass the
 * app-wide CSRF Origin/Referer check (`registerCsrf` in `routes/v1.ts`).
 */
export const adminRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireAdmin);

  app.get(
    '/me',
    { schema: { response: { 200: adminMeResponseSchema } } },
    async (request) => ({
      admin: { userId: request.user!.id, email: request.user!.email },
    }),
  );

  app.get(
    '/overview',
    { schema: { response: { 200: adminOverviewResponseSchema } } },
    async () => ({ overview: await getAdminOverview(app) }),
  );

  // ── Users ──
  app.get(
    '/users',
    {
      schema: {
        querystring: listAdminUsersQuerySchema,
        response: { 200: adminUsersResponseSchema },
      },
    },
    async (request) => listAdminUsers(app.db, request.query),
  );

  app.get(
    '/users/:id',
    {
      schema: {
        params: idParams,
        response: { 200: adminUserResponseSchema },
      },
    },
    async (request) => ({
      user: await getAdminUser(app.db, request.params.id),
    }),
  );

  app.post(
    '/users/:id/verify-email',
    {
      schema: {
        params: idParams,
        response: { 200: adminUserResponseSchema },
      },
    },
    async (request) => ({
      user: await adminVerifyUserEmail(
        app.db,
        request.user!.id,
        request.params.id,
      ),
    }),
  );

  app.post(
    '/users/:id/resend-verification',
    { schema: { params: idParams } },
    async (request, reply) => {
      const { email, verificationToken } = await adminIssueVerificationLink(
        app.db,
        request.user!.id,
        request.params.id,
      );
      await sendVerificationEmail(
        app.log,
        app.notificationQueue,
        app.emailProvider,
        email,
        `${opts.env.WEB_ORIGIN}/verify-email?token=${verificationToken}`,
      );
      return reply.status(204).send();
    },
  );

  app.post(
    '/users/:id/revoke-sessions',
    {
      schema: {
        params: idParams,
        response: { 200: adminRevokeSessionsResponseSchema },
      },
    },
    async (request) => ({
      revoked: await adminRevokeUserSessions(
        app.db,
        request.user!.id,
        request.params.id,
      ),
    }),
  );

  app.post(
    '/users/:id/block',
    {
      schema: {
        params: idParams,
        body: adminReasonRequestSchema,
        response: { 200: adminUserResponseSchema },
      },
    },
    async (request) => ({
      user: await adminBlockUser(
        app.db,
        request.user!.id,
        request.params.id,
        request.body.reason,
      ),
    }),
  );

  app.post(
    '/users/:id/unblock',
    {
      schema: {
        params: idParams,
        response: { 200: adminUserResponseSchema },
      },
    },
    async (request) => ({
      user: await adminUnblockUser(app.db, request.user!.id, request.params.id),
    }),
  );

  // ── Rides ──
  app.get(
    '/rides',
    {
      schema: {
        querystring: listAdminRidesQuerySchema,
        response: { 200: adminRidesResponseSchema },
      },
    },
    async (request) => listAdminRides(app.db, request.query),
  );

  app.post(
    '/rides/:id/hide',
    {
      schema: {
        params: idParams,
        body: adminReasonRequestSchema,
        response: { 200: adminRideResponseSchema },
      },
    },
    async (request) => ({
      ride: await adminSetRideHidden(
        app.db,
        request.user!.id,
        request.params.id,
        request.body.reason,
      ),
    }),
  );

  app.post(
    '/rides/:id/unhide',
    {
      schema: {
        params: idParams,
        response: { 200: adminRideResponseSchema },
      },
    },
    async (request) => ({
      ride: await adminSetRideHidden(
        app.db,
        request.user!.id,
        request.params.id,
        null,
      ),
    }),
  );

  app.post(
    '/rides/:id/cancel',
    {
      schema: {
        params: idParams,
        body: adminReasonRequestSchema,
        response: { 200: adminRideResponseSchema },
      },
    },
    async (request) => ({
      ride: await adminCancelRide(
        app.db,
        app.log,
        app.notificationQueue,
        request.user!.id,
        request.params.id,
        request.body.reason,
      ),
    }),
  );

  // ── Reviews ──
  app.get(
    '/reviews',
    {
      schema: {
        querystring: listAdminReviewsQuerySchema,
        response: { 200: adminReviewsResponseSchema },
      },
    },
    async (request) => listAdminReviews(app.db, request.query),
  );

  app.post(
    '/reviews/:id/hide',
    {
      schema: {
        params: idParams,
        body: adminReasonRequestSchema,
        response: { 200: adminReviewResponseSchema },
      },
    },
    async (request) => ({
      review: await adminSetReviewHidden(
        app.db,
        request.user!.id,
        request.params.id,
        request.body.reason,
      ),
    }),
  );

  app.post(
    '/reviews/:id/unhide',
    {
      schema: {
        params: idParams,
        response: { 200: adminReviewResponseSchema },
      },
    },
    async (request) => ({
      review: await adminSetReviewHidden(
        app.db,
        request.user!.id,
        request.params.id,
        null,
      ),
    }),
  );

  // ── Action log ──
  app.get(
    '/actions',
    {
      schema: {
        querystring: listAdminActionsQuerySchema,
        response: { 200: adminActionsResponseSchema },
      },
    },
    async (request) => listAdminActions(app.db, request.query),
  );
};
