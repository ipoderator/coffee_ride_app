'use client';

import { ChevronRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { RIDE_STATUSES, type AdminOverview as Overview } from 'types';
import {
  ADMIN_TERMS,
  Button,
  Card,
  ErrorState,
  MetricTile,
  RIDE_STATUS_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import {
  formatAdminCount,
  formatAdminDateTimeSeconds,
} from '@/lib/admin/format';
import { ADMIN_LIST_LINKS } from '@/lib/admin/list-links';
import { getAdminOverview } from '../api';

type Ready = {
  status: 'ready';
  overview: Overview;
  /** When the last successful answer arrived. */
  updatedAt: Date;
  isRefreshing: boolean;
  refreshFailed: boolean;
};

type LoadState = { status: 'loading' } | { status: 'error' } | Ready;

const SERVICE_KEYS = ['database', 'redis', 's3', 'email', 'maps'] as const;

/**
 * CR-231 (ADR-032): `/admin` — platform counters and the state of each
 * dependency (`GET /v1/admin/overview`). CR-232: «Обновить» re-reads it in
 * place — the current numbers stay on screen meanwhile, and a failed refresh
 * keeps them with the time they are from; counters that have an exact list
 * filter link to it.
 */
export function AdminOverview() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminOverview()
      .then((overview) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          overview,
          updatedAt: new Date(),
          isRefreshing: false,
          refreshFailed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // A refresh that fails keeps what is already on screen.
        setState((previous) =>
          previous.status === 'ready'
            ? { ...previous, isRefreshing: false, refreshFailed: true }
            : { status: 'error' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{ADMIN_TERMS.overviewTitle}</h1>
      {state.status === 'loading' ? (
        <div aria-busy="true" className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
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
        <OverviewSections
          state={state}
          onRefresh={() => {
            setState({ ...state, isRefreshing: true, refreshFailed: false });
            setAttempt((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

function OverviewSections({
  state,
  onRefresh,
}: {
  state: Ready;
  onRefresh: () => void;
}) {
  const { overview } = state;
  const { users, organizers, rides, registrations, reviews } = overview;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={ADMIN_TERMS.overviewUsers}>
        <Metric label={ADMIN_TERMS.usersTotal} value={users.total} />
        <Metric label={ADMIN_TERMS.usersNew} value={users.newLast7Days} />
        <Metric
          label={ADMIN_TERMS.usersUnverified}
          value={users.unverified}
          href={ADMIN_LIST_LINKS.unverifiedUsers}
          section={ADMIN_TERMS.overviewUsers}
        />
        <Metric
          label={ADMIN_TERMS.usersBlocked}
          value={users.blocked}
          href={ADMIN_LIST_LINKS.blockedUsers}
          section={ADMIN_TERMS.overviewUsers}
        />
        <Metric label={ADMIN_TERMS.organizersTotal} value={organizers.total} />
      </Section>

      <Section title={ADMIN_TERMS.overviewRides}>
        {RIDE_STATUSES.map((status) => (
          <Metric
            key={status}
            label={RIDE_STATUS_TERMS[status].label}
            value={rides.byStatus[status]}
          />
        ))}
        <Metric
          label={ADMIN_TERMS.ridesHidden}
          value={rides.hidden}
          href={ADMIN_LIST_LINKS.hiddenRides}
          section={ADMIN_TERMS.overviewRides}
        />
        <Metric
          label={ADMIN_TERMS.ridesUpcoming}
          value={rides.upcomingNext7Days}
        />
      </Section>

      <Section title={ADMIN_TERMS.overviewRegistrations}>
        <Metric
          label={ADMIN_TERMS.registrationsActive}
          value={registrations.active}
        />
        <Metric
          label={ADMIN_TERMS.registrationsNew}
          value={registrations.newLast7Days}
        />
      </Section>

      <Section title={ADMIN_TERMS.overviewReviews}>
        <Metric label={ADMIN_TERMS.reviewsTotal} value={reviews.total} />
        <Metric
          label={ADMIN_TERMS.reviewsHidden}
          value={reviews.hidden}
          href={ADMIN_LIST_LINKS.hiddenReviews}
          section={ADMIN_TERMS.overviewReviews}
        />
      </Section>

      <Card className="flex flex-col gap-3 p-4 md:col-span-2 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-h3 text-text">{ADMIN_TERMS.servicesTitle}</h2>
            <p
              className="text-body-sm tabular-nums text-text-secondary"
              aria-live="polite"
            >
              {ADMIN_TERMS.servicesUpdatedAt(
                formatAdminDateTimeSeconds(state.updatedAt),
              )}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={onRefresh}
            isLoading={state.isRefreshing}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {ADMIN_TERMS.servicesRefresh}
          </Button>
        </div>
        {state.refreshFailed ? (
          <p role="alert" className="text-body-sm text-danger">
            {ADMIN_TERMS.servicesRefreshFailed}
          </p>
        ) : null}
        <ul className="flex flex-col">
          {SERVICE_KEYS.map((key) => {
            const status =
              ADMIN_TERMS.serviceStatus[overview.dependencies[key]];
            return (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-none"
              >
                <span className="text-body-sm text-text">
                  {ADMIN_TERMS.services[key]}
                </span>
                <StatusBadge label={status.label} tone={status.tone} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4 md:p-5">
      <h2 className="text-h3 text-text">{title}</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </Card>
  );
}

function Metric({
  label,
  value,
  href,
  section = '',
}: {
  label: string;
  value: number;
  /** CR-232: the list filtered to exactly these records. */
  href?: string;
  /** The card's title, for the link's accessible name. */
  section?: string;
}) {
  const count = formatAdminCount(value);
  if (!href) return <MetricTile label={label} value={count} />;
  return (
    <Link
      href={href}
      aria-label={ADMIN_TERMS.metricOpenList(section, label, count)}
      className="group -m-1.5 flex items-start justify-between gap-2 rounded-lg p-1.5 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <MetricTile label={label} value={count} />
      <ChevronRight
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-text-secondary group-hover:text-text"
      />
    </Link>
  );
}
