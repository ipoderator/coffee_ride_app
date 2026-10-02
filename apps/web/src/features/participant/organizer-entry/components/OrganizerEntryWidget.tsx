'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  buttonClassName,
  CABINET_TERMS,
  Card,
  ErrorState,
  PARTICIPANT_HOME_TERMS as T,
  Skeleton,
} from 'ui';
import { getOwnOrganizerProfileOrNull } from '../api';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'organizer'; name: string }
  | { status: 'participant' };

/**
 * `/me` (CR-185, UX handoff P2): the way into organizing. An existing
 * organizer gets «Перейти в кабинет» (`/organizer`) — the old stub
 * offered every user «Создайте профиль организатора», even one who had a
 * profile. Without a profile: the CR-014 offer to create one. A failed check
 * shows a retry, never either guess.
 */
export function OrganizerEntryWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getOwnOrganizerProfileOrNull()
      .then((profile) => {
        if (cancelled) return;
        setState(
          profile
            ? { status: 'organizer', name: profile.organizerProfile.name }
            : { status: 'participant' },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <Card className="flex min-w-0 flex-col gap-4 rounded-2xl p-5 md:p-6">
      <p className="font-mono text-label text-text-secondary uppercase">
        {T.organizerLabel}
      </p>
      {state.status === 'loading' ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : state.status === 'error' ? (
        <ErrorState
          message={T.organizerLoadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : state.status === 'organizer' ? (
        <div className="flex flex-col items-start gap-3">
          <h2 className="text-h3 text-text">{T.organizerTitle}</h2>
          <p className="text-body-sm text-text-secondary wrap-anywhere">
            {T.organizerDescription(state.name)}
          </p>
          <Link href="/organizer" className={buttonClassName('secondary')}>
            {T.organizerOpen}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <h2 className="text-h3 text-text">
            {CABINET_TERMS.organizerCtaTitle}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {CABINET_TERMS.organizerCtaDescription}
          </p>
          <Link
            href="/organizer/profile"
            className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
          >
            {T.organizerCreateLink} →
          </Link>
        </div>
      )}
    </Card>
  );
}
