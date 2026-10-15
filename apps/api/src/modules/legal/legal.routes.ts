import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  CONSENT_DOCUMENT_TYPES,
  currentLegalVersion,
  LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENTS,
  legalAcceptRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { acceptPendingDocuments } from './legal.service.js';

// CR-269 (ADR-041). `GET /v1/auth/me` reports what a signed-in person still has to
// accept (`legal.pending`); this route records the acceptance. Exempt from the
// re-consent gate in `requireAuth`, which it exists to clear.
export const legalStateSchema = z.object({
  pending: z.array(z.enum(CONSENT_DOCUMENT_TYPES)),
});

const documentsResponseSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum(LEGAL_DOCUMENT_TYPES),
      path: z.string(),
      version: z.string(),
      effectiveAt: z.string(),
      sha256: z.string(),
      acceptanceRequired: z.boolean(),
    }),
  ),
});

export const legalRoutes: FastifyPluginAsyncZod = async (app) => {
  // Public: the current version of every document — what a client that is not
  // `apps/web` (scripts, load tests) sends as `consents`. A fixed list of three,
  // not a paginated collection.
  app.get(
    '/documents',
    { schema: { response: { 200: documentsResponseSchema } } },
    async (_request, reply) =>
      reply.status(200).send({
        items: LEGAL_DOCUMENT_TYPES.map((type) => {
          const current = currentLegalVersion(type);
          return {
            type,
            path: LEGAL_DOCUMENTS[type].path,
            version: current.version,
            effectiveAt: current.effectiveAt,
            sha256: current.sha256,
            acceptanceRequired: (
              CONSENT_DOCUMENT_TYPES as readonly string[]
            ).includes(type),
          };
        }),
      }),
  );

  // `200 { pending: [] }`; `400 consent_required` when a pending document is not
  // in the body, `409 legal_version_outdated` when a version is not current.
  app.post(
    '/acceptances',
    {
      schema: {
        body: legalAcceptRequestSchema,
        response: { 200: legalStateSchema },
      },
      preHandler: requireAuth,
      config: { legalAcceptanceExempt: true },
    },
    async (request, reply) => {
      const pending = await acceptPendingDocuments(
        app.db,
        request.user!.id,
        request.body.consents,
      );
      return reply.status(200).send({ pending });
    },
  );
};
