import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { generateRequestId } from './request-id.js';

function fakeRequest(headers: Record<string, string | string[]>) {
  return { headers } as IncomingMessage;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('generateRequestId', () => {
  it('reuses a valid inbound X-Request-Id', () => {
    const id = generateRequestId(
      fakeRequest({ 'x-request-id': 'caddy-abc123.def-456' }),
    );
    expect(id).toBe('caddy-abc123.def-456');
  });

  it('generates a fresh id when the header is absent', () => {
    const id = generateRequestId(fakeRequest({}));
    expect(id).toMatch(UUID_RE);
  });

  it('rejects an oversized header value and generates its own', () => {
    const id = generateRequestId(
      fakeRequest({ 'x-request-id': 'a'.repeat(200) }),
    );
    expect(id).toMatch(UUID_RE);
  });

  it('rejects a header value with characters outside the allowed charset', () => {
    const id = generateRequestId(
      fakeRequest({ 'x-request-id': 'not valid; DROP TABLE users' }),
    );
    expect(id).toMatch(UUID_RE);
  });

  it('takes the first value when the header is repeated', () => {
    const id = generateRequestId(
      fakeRequest({ 'x-request-id': ['first-id', 'second-id'] }),
    );
    expect(id).toBe('first-id');
  });
});
