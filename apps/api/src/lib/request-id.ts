import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const REQUEST_ID_HEADER = 'x-request-id';
// Bounds what an inbound header we don't control (Caddy passes through
// whatever the original client sent, CR-075) is allowed to feed into every
// subsequent structured log line for this request — an unbounded/weird
// value here is a log-injection/log-volume surface, not just cosmetic.
const VALID_REQUEST_ID = /^[\w.-]{1,128}$/;

/**
 * Fastify `genReqId` implementation (CR-079). Reuses a valid inbound
 * `X-Request-Id` so a request can be correlated across the CR-075 Caddy ->
 * web -> api hop; otherwise generates a fresh one. Fastify's default
 * `genReqId` is a per-process incrementing counter, which is useless for
 * that correlation.
 */
export function generateRequestId(req: IncomingMessage): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && VALID_REQUEST_ID.test(value)) return value;
  return randomUUID();
}
