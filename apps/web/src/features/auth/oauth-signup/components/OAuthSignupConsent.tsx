'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CONSENT_DOCUMENT_TYPES,
  type LegalConsents,
  type OAuthSignupInfo,
} from 'types';
import {
  AUTH_TERMS,
  Button,
  ErrorState,
  OAUTH_SIGNUP_TERMS,
  Skeleton,
} from 'ui';
import {
  allConsentsGiven,
  consentErrorMessage,
  consentPayload,
  LegalConsentFields,
  type ConsentState,
} from '@/components/legal/LegalConsentFields';
import {
  ApiError,
  cancelOAuthSignup,
  completeOAuthSignup,
  getOAuthSignup,
} from '../api';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; signup: OAuthSignupInfo }
  | { kind: 'expired' }
  | { kind: 'error' };

const isExpired = (error: unknown) =>
  error instanceof ApiError && error.problem.code === 'oauth_signup_expired';

/**
 * CR-268 (ADR-041): `/register/consent`. A first Google/Yandex sign-in arrives here
 * with no account and no session yet; the server holds the verified identity behind
 * an httpOnly cookie. The page names the provider and the address, asks for the two
 * separate consents and only then creates the account (`POST`). «Отмена» forgets
 * the pending sign-up. Success is a full navigation, so the whole app re-reads the
 * new session.
 */
export function OAuthSignupConsent() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [consents, setConsents] = useState<ConsentState>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'submit' | 'cancel' | null>(null);
  const consentsGiven = allConsentsGiven(CONSENT_DOCUMENT_TYPES, consents);

  useEffect(() => {
    let cancelled = false;
    getOAuthSignup()
      .then((signup) => {
        if (!cancelled) setPhase({ kind: 'ready', signup });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPhase({ kind: isExpired(error) ? 'expired' : 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setPhase({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !consentsGiven) return;
    setBusy('submit');
    setConsentError(null);
    setFormError(null);
    try {
      const { next } = await completeOAuthSignup(
        consentPayload(CONSENT_DOCUMENT_TYPES) as LegalConsents,
      );
      window.location.assign(next);
      return;
    } catch (error) {
      if (isExpired(error)) {
        setPhase({ kind: 'expired' });
      } else if (error instanceof ApiError) {
        const consentMessage = consentErrorMessage(error.problem);
        if (consentMessage) setConsentError(consentMessage);
        else if (error.problem.code === 'oauth_signup_failed') {
          setFormError(OAUTH_SIGNUP_TERMS.failed);
        } else setFormError(AUTH_TERMS.genericError);
      } else {
        setFormError(AUTH_TERMS.genericError);
      }
    }
    setBusy(null);
  }

  async function handleCancel() {
    if (busy) return;
    setBusy('cancel');
    try {
      await cancelOAuthSignup();
    } catch {
      // Nothing to keep either way: the pending sign-up expires in minutes.
    }
    router.replace('/register');
  }

  if (phase.kind === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{OAUTH_SIGNUP_TERMS.loading}</span>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (phase.kind === 'expired') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-text">{OAUTH_SIGNUP_TERMS.expiredTitle}</h1>
        <p className="text-body text-text-secondary">
          {OAUTH_SIGNUP_TERMS.expiredBody}
        </p>
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          {OAUTH_SIGNUP_TERMS.expiredAction}
        </Link>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-text">{OAUTH_SIGNUP_TERMS.title}</h1>
        <ErrorState message={AUTH_TERMS.genericError} onRetry={retry} />
      </div>
    );
  }

  const providerName = OAUTH_SIGNUP_TERMS.provider[phase.signup.provider];
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-text">{OAUTH_SIGNUP_TERMS.title}</h1>
        <p className="text-body text-text-secondary">
          {OAUTH_SIGNUP_TERMS.lead(providerName, phase.signup.email)}
        </p>
      </div>

      <LegalConsentFields
        idPrefix="oauth-signup"
        documents={CONSENT_DOCUMENT_TYPES}
        value={consents}
        onChange={(document, checked) => {
          setConsents((current) => ({ ...current, [document]: checked }));
          setConsentError(null);
        }}
        disabled={busy !== null}
        error={consentError}
      />

      {formError && (
        <p role="alert" className="text-body-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          isLoading={busy === 'submit'}
          disabled={!consentsGiven || busy === 'cancel'}
          className="w-full"
        >
          {busy === 'submit'
            ? OAUTH_SIGNUP_TERMS.submitPending
            : OAUTH_SIGNUP_TERMS.submit}
        </Button>
        <Button
          variant="secondary"
          onClick={handleCancel}
          isLoading={busy === 'cancel'}
          disabled={busy === 'submit'}
          className="w-full"
        >
          {OAUTH_SIGNUP_TERMS.cancel}
        </Button>
      </div>
    </form>
  );
}
