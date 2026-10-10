import type {
  AdminUserDetail,
  AdminUserFilter,
  GetAdminUserResponse,
  ListAdminActionsResponse,
  ListAdminUsersResponse,
  RevokeAdminUserSessionsResponse,
} from 'types';
import { adminRequest, toQueryString } from '@/lib/admin/client';

// A type alias, not an interface: `useAdminUrlFilters` needs it to be
// assignable to a string record.
export type AdminUsersFilters = {
  q: string;
  filter: AdminUserFilter;
};

export function listAdminUsers(
  { q, filter }: AdminUsersFilters,
  cursor?: string,
): Promise<ListAdminUsersResponse> {
  return adminRequest(
    `/users${toQueryString({ q, filter: filter === 'all' ? undefined : filter, cursor })}`,
  );
}

async function userOf(
  request: Promise<GetAdminUserResponse>,
): Promise<AdminUserDetail> {
  return (await request).user;
}

/** `404 not_found` when there is no such user. */
export function getAdminUser(id: string): Promise<AdminUserDetail> {
  return userOf(adminRequest(`/users/${encodeURIComponent(id)}`));
}

export function verifyAdminUserEmail(id: string): Promise<AdminUserDetail> {
  return userOf(
    adminRequest(`/users/${encodeURIComponent(id)}/verify-email`, {
      method: 'POST',
    }),
  );
}

export function resendAdminUserVerification(id: string): Promise<void> {
  return adminRequest(`/users/${encodeURIComponent(id)}/resend-verification`, {
    method: 'POST',
  });
}

/** How many sessions were ended. */
export async function revokeAdminUserSessions(id: string): Promise<number> {
  const body = await adminRequest<RevokeAdminUserSessionsResponse>(
    `/users/${encodeURIComponent(id)}/revoke-sessions`,
    { method: 'POST' },
  );
  return body.revoked;
}

/** `409 cannot_block_admin` for an admin account. */
export function blockAdminUser(
  id: string,
  reason: string,
): Promise<AdminUserDetail> {
  return userOf(
    adminRequest(`/users/${encodeURIComponent(id)}/block`, {
      method: 'POST',
      body: { reason },
    }),
  );
}

export function unblockAdminUser(id: string): Promise<AdminUserDetail> {
  return userOf(
    adminRequest(`/users/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
    }),
  );
}

/** The user card's «История действий» — the log narrowed to this user. */
export function listAdminUserActions(
  id: string,
  cursor?: string,
): Promise<ListAdminActionsResponse> {
  return adminRequest(
    `/actions${toQueryString({ targetType: 'user', targetId: id, cursor })}`,
  );
}
