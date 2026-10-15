'use client';

import Link from 'next/link';
import {
  type ConsentDocumentType,
  currentLegalVersion,
  LEGAL_DOCUMENTS,
  type LegalConsents,
} from 'types';
import { LEGAL_CONSENT_TERMS } from 'ui';

// CR-268 (ADR-041): the consent checkboxes — one per document, unticked, required,
// never combined with each other or with the reCAPTCHA check. Shared by `/register`,
// `/register/consent` and `/legal-update` (a cross-cutting component, not one
// feature's internals: `.claude/rules/extensibility.md`).

export type ConsentState = Partial<Record<ConsentDocumentType, boolean>>;

const LABELS: Record<ConsentDocumentType, { prefix: string; link: string }> = {
  terms: {
    prefix: LEGAL_CONSENT_TERMS.termsPrefix,
    link: LEGAL_CONSENT_TERMS.termsLink,
  },
  personal_data_consent: {
    prefix: LEGAL_CONSENT_TERMS.personalDataPrefix,
    link: LEGAL_CONSENT_TERMS.personalDataLink,
  },
};

export function allConsentsGiven(
  documents: readonly ConsentDocumentType[],
  state: ConsentState,
): boolean {
  return documents.every((document) => state[document] === true);
}

/**
 * What the API receives: the current version of each ticked document — the
 * version this page shows, so a page older than the documents gets `409
 * legal_version_outdated` instead of recording a text nobody read.
 */
export function consentPayload(
  documents: readonly ConsentDocumentType[],
): Partial<LegalConsents> {
  return Object.fromEntries(
    documents.map((document) => [
      document,
      currentLegalVersion(document).version,
    ]),
  );
}

/**
 * The consent message for an API refusal, or `null` when the refusal is about
 * something else: `consent_required`, `legal_version_outdated`, or a validation
 * error on `consents.*` (a request the form would never send).
 */
export function consentErrorMessage(problem: {
  code?: string;
  errors?: ReadonlyArray<{ path: string }>;
}): string | null {
  if (problem.code === 'legal_version_outdated') {
    return LEGAL_CONSENT_TERMS.versionOutdated;
  }
  if (problem.code === 'consent_required') {
    return LEGAL_CONSENT_TERMS.consentRequired;
  }
  if (
    problem.code === 'validation_error' &&
    problem.errors?.some((issue) => issue.path.startsWith('consents'))
  ) {
    return LEGAL_CONSENT_TERMS.consentRequired;
  }
  return null;
}

export function LegalConsentFields({
  idPrefix,
  documents,
  value,
  onChange,
  disabled = false,
  error = null,
}: {
  idPrefix: string;
  documents: readonly ConsentDocumentType[];
  value: ConsentState;
  onChange: (document: ConsentDocumentType, checked: boolean) => void;
  disabled?: boolean;
  /** A refusal from the API, read out at once (`role="alert"`). */
  error?: string | null;
}) {
  const hintId = `${idPrefix}-consent-hint`;
  const errorId = `${idPrefix}-consent-error`;
  const complete = allConsentsGiven(documents, value);
  const describedBy =
    [!complete && hintId, error && errorId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">{LEGAL_CONSENT_TERMS.legend}</legend>
      {documents.map((document) => {
        const id = `${idPrefix}-consent-${document}`;
        const label = LABELS[document];
        return (
          <div key={document} className="flex min-h-11 items-start gap-3 py-1">
            <input
              id={id}
              type="checkbox"
              // Not the native `required` (its bubble is the browser's own,
              // CR-194): the forms say it in Russian and keep submit disabled.
              aria-required="true"
              checked={value[document] === true}
              onChange={(event) => onChange(document, event.target.checked)}
              disabled={disabled}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              className="mt-0.5 size-5 shrink-0 rounded border-[1.5px] border-frame accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <label htmlFor={id} className="text-body-sm text-text">
              {label.prefix}
              <Link
                href={LEGAL_DOCUMENTS[document].path}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {label.link}
                <span className="sr-only"> {LEGAL_CONSENT_TERMS.newTab}</span>
              </Link>
            </label>
          </div>
        );
      })}
      <p className="text-body-sm text-text-secondary">
        {LEGAL_CONSENT_TERMS.privacyPrefix}
        <Link
          href={LEGAL_DOCUMENTS.privacy.path}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {LEGAL_CONSENT_TERMS.privacyLink}
          <span className="sr-only"> {LEGAL_CONSENT_TERMS.newTab}</span>
        </Link>
        {LEGAL_CONSENT_TERMS.privacyEnd}
      </p>
      {!complete && (
        <p id={hintId} className="text-body-sm text-text-secondary">
          {LEGAL_CONSENT_TERMS.hint(documents.length)}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
