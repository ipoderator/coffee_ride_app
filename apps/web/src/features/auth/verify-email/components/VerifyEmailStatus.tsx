'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, ErrorState, Skeleton, VERIFY_EMAIL_TERMS } from 'ui';
import { ResendVerificationButton } from '@/lib/auth/ResendVerificationButton';
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
 */
export function VerifyEmailStatus({ token }: { token: string | null }) {
  const [status, setStatus] = useState<Status>(
    token ? 'verifying' : 'missing-token',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    verifyEmail({ token })
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
        href="/login"
        className="mt-4 inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
      >
        {VERIFY_EMAIL_TERMS.loginLink}
      </Link>
    </Card>
  );
}
