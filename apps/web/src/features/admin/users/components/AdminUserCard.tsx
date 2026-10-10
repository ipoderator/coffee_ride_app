'use client';

import { useEffect, useState } from 'react';
import type { AdminActionItem, AdminUserDetail } from 'types';
import {
  ADMIN_TERMS,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
  useToast,
} from 'ui';
import { AdminActionList } from '@/components/admin/AdminActionList';
import { AdminListBody } from '@/components/admin/AdminListBody';
import { AdminReasonDialog } from '@/components/admin/AdminReasonDialog';
import { BackLink } from '@/components/site/BackLink';
import { adminActionErrorMessage } from '@/lib/admin/errors';
import { formatAdminDateTime } from '@/lib/admin/format';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { ApiError } from '@/lib/api/errors';
import {
  blockAdminUser,
  getAdminUser,
  listAdminUserActions,
  resendAdminUserVerification,
  revokeAdminUserSessions,
  unblockAdminUser,
  verifyAdminUserEmail,
} from '../api';
import { AdminUserBadges } from './AdminUserBadges';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_found' }
  | { status: 'ready'; user: AdminUserDetail };

type OpenDialog = 'block' | 'unblock' | 'revoke' | null;
type PendingAction = 'verify' | 'resend' | 'unblock' | 'revoke' | null;

/**
 * CR-231 (ADR-032): `/admin/users/[id]` — the account's facts, the admin's
 * actions on it, and its own slice of the action log. Never shows a password,
 * a session token or emergency data: the API does not return them. Keyed by
 * the user id on its page, so another user's card starts from scratch.
 */
export function AdminUserCard({
  userId,
  backHref = '/admin/users',
}: {
  userId: string;
  /** CR-232: the users list with the filters the admin came from. */
  backHref?: string;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Bumped after every successful action, so the history re-reads its first
  // page and shows the row that action just wrote.
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useAdminList<AdminActionItem>(
    `${userId}:${historyVersion}`,
    (cursor) => listAdminUserActions(userId, cursor),
  );

  useEffect(() => {
    let cancelled = false;
    getAdminUser(userId)
      .then((user) => {
        if (!cancelled) setState({ status: 'ready', user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(
          error instanceof ApiError && error.problem.status === 404
            ? { status: 'not_found' }
            : { status: 'error' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={backHref} label={ADMIN_TERMS.backToUsers} />
      {state.status === 'loading' ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : state.status === 'not_found' ? (
        <EmptyState title={ADMIN_TERMS.userNotFound} />
      ) : state.status === 'error' ? (
        <ErrorState
          message={ADMIN_TERMS.loadError}
          onRetry={() => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          }}
          retryLabel={ADMIN_TERMS.retry}
        />
      ) : (
        <UserDetails
          user={state.user}
          onChanged={(user) => {
            setState({ status: 'ready', user });
            setHistoryVersion((value) => value + 1);
          }}
        />
      )}

      <section
        aria-labelledby="admin-user-history"
        className="flex flex-col gap-3"
      >
        <h2 id="admin-user-history" className="text-h3 text-text">
          {ADMIN_TERMS.historyTitle}
        </h2>
        <AdminListBody
          state={history.state}
          onRetry={history.retry}
          onLoadMore={history.loadMore}
          emptyTitle={ADMIN_TERMS.historyEmpty}
        >
          {(items) => (
            <Card className="p-4 md:p-5">
              <AdminActionList items={items} showTarget={false} />
            </Card>
          )}
        </AdminListBody>
      </section>
    </div>
  );
}

function UserDetails({
  user,
  onChanged,
}: {
  user: AdminUserDetail;
  onChanged: (user: AdminUserDetail) => void;
}) {
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  async function run<T>(
    action: Exclude<PendingAction, null>,
    perform: () => Promise<T>,
    done: (result: T) => { message: string; user: AdminUserDetail },
  ) {
    setPending(action);
    try {
      const { message, user: updated } = done(await perform());
      showToast(message, 'success');
      onChanged(updated);
    } catch (error) {
      showToast(adminActionErrorMessage(error), 'danger');
    } finally {
      setPending(null);
      setDialog(null);
    }
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="break-all text-h1 text-text">{user.email}</h1>
        <p className="text-body text-text-secondary">
          {user.displayName ?? (name || ADMIN_TERMS.noDisplayName)}
        </p>
        <AdminUserBadges user={user} />
      </header>

      {user.blockedAt ? (
        <Notice title={ADMIN_TERMS.blockedTitle}>
          <p>{formatAdminDateTime(user.blockedAt)}</p>
          {user.blockReason ? (
            <p className="break-words">
              {ADMIN_TERMS.reasonLine(user.blockReason)}
            </p>
          ) : null}
        </Notice>
      ) : null}

      <Card className="p-4 md:p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label={ADMIN_TERMS.factRegistered}
            value={formatAdminDateTime(user.createdAt)}
          />
          <Fact
            label={ADMIN_TERMS.factEmail}
            value={
              user.emailVerified
                ? ADMIN_TERMS.emailVerified
                : ADMIN_TERMS.emailUnverified
            }
          />
          <Fact
            label={ADMIN_TERMS.factOrganizer}
            value={user.organizer?.name ?? ADMIN_TERMS.noOrganizer}
          />
          <Fact
            label={ADMIN_TERMS.factSessions}
            value={String(user.activeSessions)}
          />
          <Fact
            label={ADMIN_TERMS.factRides}
            value={String(user.ridesOrganized)}
          />
          <Fact
            label={ADMIN_TERMS.factRegistrations}
            value={String(user.activeRegistrations)}
          />
          <Fact
            label={ADMIN_TERMS.factReviews}
            value={String(user.reviewsWritten)}
          />
        </dl>
      </Card>

      <div className="flex flex-wrap gap-3">
        {!user.emailVerified ? (
          <>
            <Button
              variant="secondary"
              isLoading={pending === 'verify'}
              disabled={pending !== null}
              onClick={() =>
                run(
                  'verify',
                  () => verifyAdminUserEmail(user.id),
                  (updated) => ({
                    message: ADMIN_TERMS.verifyEmailDone,
                    user: updated,
                  }),
                )
              }
            >
              {ADMIN_TERMS.verifyEmail}
            </Button>
            <Button
              variant="secondary"
              isLoading={pending === 'resend'}
              disabled={pending !== null}
              onClick={() =>
                run(
                  'resend',
                  () => resendAdminUserVerification(user.id),
                  () => ({
                    message: ADMIN_TERMS.resendVerificationDone,
                    user,
                  }),
                )
              }
            >
              {ADMIN_TERMS.resendVerification}
            </Button>
          </>
        ) : null}
        <Button
          variant="secondary"
          disabled={pending !== null}
          onClick={() => setDialog('revoke')}
        >
          {ADMIN_TERMS.revokeSessions}
        </Button>
        {user.blockedAt ? (
          <Button
            variant="secondary"
            disabled={pending !== null}
            onClick={() => setDialog('unblock')}
          >
            {ADMIN_TERMS.unblock}
          </Button>
        ) : user.isAdmin ? null : (
          <Button
            variant="danger"
            disabled={pending !== null}
            onClick={() => setDialog('block')}
          >
            {ADMIN_TERMS.block}
          </Button>
        )}
      </div>
      {user.isAdmin && !user.blockedAt ? (
        <p className="text-body-sm text-text-muted">
          {ADMIN_TERMS.adminCannotBeBlocked}
        </p>
      ) : null}

      <ConfirmDialog
        open={dialog === 'revoke'}
        onClose={() => setDialog(null)}
        title={ADMIN_TERMS.revokeSessionsTitle}
        description={ADMIN_TERMS.revokeSessionsDescription}
        confirmLabel={ADMIN_TERMS.revokeSessions}
        cancelLabel={ADMIN_TERMS.cancel}
        isConfirming={pending === 'revoke'}
        onConfirm={() =>
          void run(
            'revoke',
            () => revokeAdminUserSessions(user.id),
            (revoked) => ({
              message: ADMIN_TERMS.revokeSessionsDone(revoked),
              user: { ...user, activeSessions: 0 },
            }),
          )
        }
      />
      <ConfirmDialog
        open={dialog === 'unblock'}
        onClose={() => setDialog(null)}
        title={ADMIN_TERMS.unblockTitle}
        description={ADMIN_TERMS.unblockDescription}
        confirmLabel={ADMIN_TERMS.unblock}
        cancelLabel={ADMIN_TERMS.cancel}
        confirmVariant="primary"
        isConfirming={pending === 'unblock'}
        onConfirm={() =>
          void run(
            'unblock',
            () => unblockAdminUser(user.id),
            (updated) => ({ message: ADMIN_TERMS.unblockDone, user: updated }),
          )
        }
      />
      <AdminReasonDialog
        open={dialog === 'block'}
        onClose={() => setDialog(null)}
        title={ADMIN_TERMS.blockTitle}
        description={ADMIN_TERMS.blockDescription}
        subject={[{ label: ADMIN_TERMS.subjectAccount, value: user.email }]}
        reasonHint={ADMIN_TERMS.reasonHintLogOnly}
        confirmLabel={ADMIN_TERMS.block}
        onSubmit={async (reason) => {
          try {
            const updated = await blockAdminUser(user.id, reason);
            showToast(ADMIN_TERMS.blockDone, 'success');
            onChanged(updated);
            return null;
          } catch (error) {
            return adminActionErrorMessage(error);
          }
        }}
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="break-words text-body text-text">{value}</dd>
    </div>
  );
}
