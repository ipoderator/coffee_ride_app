import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod';
import type { ProblemDetails } from 'types';

// RFC 9457 (application/problem+json) envelope fixed by ADR-011 / docs/api.md.
// `type` points at a stable per-code URI; the domain doesn't exist yet, so this
// uses the same placeholder ADR-011 itself documents — swap for the real one in
// a single place once it does. The envelope shape itself lives in
// `packages/types` (CR-007) so a future apps/web API client types a failed
// response the same way this handler constructs it, instead of a second,
// possibly-drifted copy of the same interface.
const PROBLEM_BASE_URL = 'https://coffee-ride.example/errors';

function sendProblem(
  reply: FastifyReply,
  params: {
    status: number;
    code: string;
    title: string;
    detail: string;
    instance: string;
    errors?: Array<{ path: string; message: string }>;
  },
) {
  const body: ProblemDetails = {
    type: `${PROBLEM_BASE_URL}/${params.code}`,
    title: params.title,
    status: params.status,
    detail: params.detail,
    instance: params.instance,
    code: params.code,
    ...(params.errors ? { errors: params.errors } : {}),
  };

  return reply
    .status(params.status)
    .type('application/problem+json')
    .send(body);
}

/**
 * Registers the RFC 9457 error/not-found handlers required by docs/api.md.
 * Every non-2xx response — validation failures, 404s, unexpected errors —
 * goes through here so the shape is enforced in one place, not per route.
 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    sendProblem(reply, {
      status: 404,
      code: 'not_found',
      title: 'Not Found',
      detail: `No route matches ${request.method} ${request.url}.`,
      instance: request.url,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((issue) => {
        const zodIssue = (
          issue.params as
            { issue?: { path?: Array<string | number> } } | undefined
        )?.issue;
        const path =
          zodIssue?.path?.join('.') ||
          issue.instancePath.replace(/^\//, '').replace(/\//g, '.') ||
          '(root)';
        return { path, message: issue.message ?? 'Invalid value.' };
      });

      return sendProblem(reply, {
        status: 400,
        code: 'validation_error',
        title: 'Validation failed',
        detail: 'One or more fields failed validation. See errors for details.',
        instance: request.url,
        errors,
      });
    }

    const status =
      (typeof error.statusCode === 'number' && error.statusCode) || 500;

    // Never leak stack traces / driver internals (.claude/rules/backend.md).
    // Below 500, the thrown message is assumed to already be user-safe (it was
    // written by this codebase, not by a dependency/driver).
    if (status >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
      return sendProblem(reply, {
        status: 500,
        code: 'internal_error',
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred.',
        instance: request.url,
      });
    }

    request.log.warn({ err: error }, 'Request error');
    // Domain errors (e.g. `AuthServiceError`) may carry a human-readable
    // `title` alongside the RFC 9457-required `code` — falls back to
    // `error.name` for plain thrown errors that don't set one.
    const title =
      (error as FastifyError & { title?: string }).title ||
      error.name ||
      'Request Error';
    return sendProblem(reply, {
      status,
      code: error.code ? error.code.toLowerCase() : 'request_error',
      title,
      detail: error.message,
      instance: request.url,
    });
  });
}
