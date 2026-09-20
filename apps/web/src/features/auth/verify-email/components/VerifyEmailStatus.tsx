'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, ErrorState, Skeleton, VERIFY_EMAIL_TERMS } from 'ui';
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

  if (status === 'missing-token') {
    return (
      <ErrorState message={VERIFY_EMAIL_TERMS.missingToken} tone="danger" />
    );
  }

  if (status === 'error') {
    return (
      <ErrorState message={errorMessage ?? VERIFY_EMAIL_TERMS.genericError} />
    );
  }

  return (
    <Card role="status" aria-live="polite">
      <h2 className="text-xl font-semibold text-text">
        {VERIFY_EMAIL_TERMS.successTitle}
      </h2>
      <p className="mt-2 text-text-secondary">
        {VERIFY_EMAIL_TERMS.successBody}
      </p>
      <Link
        href="/login"
        className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
      >
        {VERIFY_EMAIL_TERMS.loginLink}
      </Link>
    </Card>
  );
}
