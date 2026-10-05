'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Card, ErrorState, Skeleton, VERIFY_EMAIL_TERMS } from 'ui';
import { ResendVerificationButton } from '@/lib/auth/ResendVerificationButton';
import { loginHref } from '@/lib/auth/next-path';
import { ApiError, verifyEmail } from '../api';

type Status = 'verifying' | 'success' | 'missing-token' | 'error';

const TOKEN_ERROR_CODES = new Set([
  'invalid_verification_token',
  'verification_token_already_used',
  'verification_token_expired',
]);

/**
 * `/verify-email` (CR-099, closes KI-026's screen gap — previously the only
 * way to complete verification was a direct `POST` via curl/API client).
 * Reads `?token=` (passed down from the page's Server Component) and calls
 * `POST /v1/auth/verify-email` once on mount.
 *
 * CR-197: `next` (validated by the page, again by `loginHref`) is the return
 * target the visitor registered from; «Перейти ко входу» carries it on.
 */
export function VerifyEmailStatus({
  token,
  next = null,
}: {
  token: string | null;
  next?: string | null;
}) {
  const [status, setStatus] = useState<Status>(
    token ? 'verifying' : 'missing-token',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // CR-211. The request must be sent exactly once per token, not once per
  // effect run: the token is single-use (`.claude/rules/do-not-break.md` —
  // claimed by a guarded `UPDATE … WHERE used_at IS NULL`), so a second call
  // with the same one legitimately answers
  // `verification_token_already_used`. React Strict Mode's dev-only
  // double-invoke made the component race itself — the first call verified,
  // the second burned the link and rendered «Ссылка недействительна…» over a
  // verification that had in fact succeeded. `cancelled` below cannot prevent
  // this: it only gates `setState`, after the request is already in flight.
  // Same class of fix as CR-101's `containerGeneration` guard in
  // `packages/maps-2gis/src/render.ts`.
  //
  // The in-flight promise is cached rather than the effect merely bailing
  // out: a re-run must still *subscribe* to the original request's result.
  // Guarding re-entry alone would leave the second run with nothing to
  // await — its predecessor's `cancelled` cleanup having already fired — and
  // the screen would sit on the skeleton forever.
  const pending = useRef<{
    token: string;
    promise: ReturnType<typeof verifyEmail>;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    if (pending.current?.token !== token) {
      pending.current = { token, promise: verifyEmail({ token }) };
    }
    let cancelled = false;

    pending.current.promise
      .then(() => {
        if (cancelled) return;
        setStatus('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          TOKEN_ERROR_CODES.has(error.problem.code ?? '')
        ) {
          setErrorMessage(VERIFY_EMAIL_TERMS.invalidOrExpired);
        } else {
          setErrorMessage(VERIFY_EMAIL_TERMS.genericError);
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'verifying') {
    return (
      <Card aria-busy="true" aria-label={VERIFY_EMAIL_TERMS.verifying}>
        <Skeleton className="h-6 w-48" />
      </Card>
    );
  }

  // CR-168 (KI-026): every failure here used to be terminal — the copy said
  // «Запросите новую при следующем входе» and nothing at login did that. A
  // signed-in user can now get a fresh link without leaving the page.
  if (status === 'missing-token' || status === 'error') {
    const message =
      status === 'missing-token'
        ? VERIFY_EMAIL_TERMS.missingToken
        : (errorMessage ?? VERIFY_EMAIL_TERMS.genericError);

    return (
      <div className="flex flex-col gap-4">
        <ErrorState message={message} tone="danger" />
        <ResendVerificationButton className="self-start" />
      </div>
    );
  }

  return (
    <Card role="status" aria-live="polite">
      <h2 className="text-h2 text-text">{VERIFY_EMAIL_TERMS.successTitle}</h2>
      <p className="mt-2 text-text-secondary">
        {VERIFY_EMAIL_TERMS.successBody}
      </p>
      <Link
        href={loginHref(next)}
        className="mt-4 inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
      >
        {VERIFY_EMAIL_TERMS.loginLink}
      </Link>
    </Card>
  );
}
