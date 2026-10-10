import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './auth.js';

// CR-229 (ADR-032): `requireAdmin` on its own. The route tests in
// `modules/admin/admin.routes.test.ts` always reach it after `requireAuth`;
// this covers it answering the same 404 when no user is attached at all.
function fakeReply() {
  const reply = {
    status: vi.fn(() => reply),
    type: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply;
}

function fakeRequest(user: { id: string } | undefined, adminRows: unknown[]) {
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: async () => adminRows,
  };
  return {
    user,
    method: 'GET',
    url: '/v1/admin/overview',
    server: { db: query },
  } as unknown as FastifyRequest;
}

describe('requireAdmin', () => {
  it('answers the unknown-route 404 without a user, never touching the DB', async () => {
    const reply = fakeReply();
    const request = fakeRequest(undefined, [{ userId: 'x' }]);
    await requireAdmin(request, reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'not_found', status: 404 }),
    );
  });

  it('lets an admin through and answers 404 to anyone else', async () => {
    const admin = fakeReply();
    await requireAdmin(
      fakeRequest({ id: 'u1' }, [{ userId: 'u1' }]),
      admin as unknown as FastifyReply,
    );
    expect(admin.status).not.toHaveBeenCalled();

    const other = fakeReply();
    await requireAdmin(
      fakeRequest({ id: 'u2' }, []),
      other as unknown as FastifyReply,
    );
    expect(other.status).toHaveBeenCalledWith(404);
  });
});
