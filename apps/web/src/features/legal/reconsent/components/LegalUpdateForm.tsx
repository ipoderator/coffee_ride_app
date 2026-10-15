'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  type ConsentDocumentType,
  currentLegalVersion,
  LEGAL_DOCUMENTS,
} from 'types';
import {
  AUTH_TERMS,
  Button,
  LEGAL_CONSENT_TERMS,
  LEGAL_TERMS,
  LEGAL_UPDATE_TERMS,
  Skeleton,
} from 'ui';
import {
  allConsentsGiven,
  consentErrorMessage,
  consentPayload,
  LegalConsentFields,
  type ConsentState,
} from '@/components/legal/LegalConsentFields';
import { logout } from '@/lib/api/current-user';
import { loginHref } from '@/lib/auth/next-path';
import { useSession } from '@/lib/auth/session-context';
import { SITE_CONTACT_EMAIL } from '@/lib/site/contact';
import { formatLegalDate } from '../../format';
import { acceptLegalDocuments, ApiError } from '../api';

const DOCUMENT_TITLES: Record<ConsentDocumentType, string> = {
  terms: LEGAL_TERMS.termsTitle,
  personal_data_consent: LEGAL_TERMS.personalDataConsentTitle,
};

const DELETE_HREF = `mailto:${SITE_CONTACT_EMAIL}?subject=${encodeURIComponent(
  LEGAL_UPDATE_TERMS.deleteSubject,
)}`;

/**
 * CR-269 (ADR-041): `/legal-update`. A signed-in person with a material new version
 * pending (`useSession().legalPending`) reads what changed and accepts it — one
 * checkbox per pending document. Documents, sign-out and the deletion request stay
 * available without accepting. Success is a full navigation to `next`, so the
 * session (and its `legalPending`) is read again.
 */
export function LegalUpdateForm({ next }: { next: string }) {
  const { status, legalPending, refresh } = useSession();
  const router = useRouter();
  const documents: ConsentDocumentType[] | null =
    status === 'authenticated' && legalPending.length > 0 ? legalPending : null;
  const [consents, setConsents] = useState<ConsentState>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'logout' | null>(null);

  useEffect(() => {
    // Nothing to accept (already done in another tab): carry on.
    if (status === 'authenticated' && legalPending.length === 0) {
      window.location.replace(next);
    }
  }, [status, legalPending, next]);

  if (status === 'anonymous') {
    return (
      <p className="text-body text-text">
        <Link
          href={loginHref(null)}
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          {AUTH_TERMS.loginSubmit}
        </Link>
      </p>
    );
  }

  if (documents === null) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{LEGAL_UPDATE_TERMS.submitPending}</span>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const consentsGiven = allConsentsGiven(documents, consents);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !documents || !consentsGiven) return;
    setBusy('accept');
    setConsentError(null);
    setFormError(null);
    try {
      await acceptLegalDocuments(consentPayload(documents));
      window.location.assign(next);
      return;
    } catch (error) {
      const message =
        error instanceof ApiError ? consentErrorMessage(error.problem) : null;
      if (message) setConsentError(message);
      else setFormError(AUTH_TERMS.genericError);
    }
    setBusy(null);
  }

  async function handleLogout() {
    if (busy) return;
    setBusy('logout');
    try {
      await logout();
      // The header does the same: re-read the (now empty) session, go home.
      refresh();
      router.replace('/');
    } catch {
      setFormError(AUTH_TERMS.genericError);
      setBusy(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <section
        aria-labelledby="legal-update-changes"
        className="flex flex-col gap-4"
      >
        <h2 id="legal-update-changes" className="text-h3 text-text">
          {LEGAL_UPDATE_TERMS.changesTitle}
        </h2>
        <ul className="flex flex-col gap-4">
          {documents.map((document) => {
            const version = currentLegalVersion(document);
            return (
              <li
                key={document}
                className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3"
              >
                <Link
                  href={LEGAL_DOCUMENTS[document].path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body font-semibold text-primary hover:underline"
                >
                  {DOCUMENT_TITLES[document]}
                  <span className="sr-only"> {LEGAL_CONSENT_TERMS.newTab}</span>
                </Link>
                <p className="text-body-sm text-text-secondary">
                  {LEGAL_TERMS.versionLine(
                    version.version,
                    formatLegalDate(version.effectiveAt),
                  )}
                </p>
                <p className="text-body-sm text-text">{version.summary}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <LegalConsentFields
        idPrefix="legal-update"
        documents={documents}
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="submit"
          isLoading={busy === 'accept'}
          disabled={!consentsGiven || busy === 'logout'}
          className="sm:flex-1"
        >
          {busy === 'accept'
            ? LEGAL_UPDATE_TERMS.submitPending
            : LEGAL_UPDATE_TERMS.submit}
        </Button>
        <Button
          variant="secondary"
          onClick={handleLogout}
          isLoading={busy === 'logout'}
          disabled={busy === 'accept'}
        >
          {LEGAL_UPDATE_TERMS.logout}
        </Button>
      </div>

      <p className="text-body-sm text-text-secondary">
        {LEGAL_UPDATE_TERMS.deletePrefix}
        <a
          href={DELETE_HREF}
          className="font-medium text-primary hover:underline"
        >
          {LEGAL_UPDATE_TERMS.deleteLink}
        </a>
        {LEGAL_UPDATE_TERMS.deleteEnd}
      </p>
    </form>
  );
}
