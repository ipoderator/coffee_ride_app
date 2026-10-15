import Link from 'next/link';
import { LEGAL_DOCUMENTS } from 'types';
import { LEGAL_TERMS } from 'ui';

/**
 * CR-269 (ADR-041): the documents named for information under `/login` — signing
 * in to an existing account accepts nothing; a new account accepts them with its
 * own checkboxes (`LegalConsentFields`).
 */
export function LegalInfoLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      {LEGAL_TERMS.infoPrefix}
      <Link
        href={LEGAL_DOCUMENTS.terms.path}
        className="text-primary hover:underline"
      >
        {LEGAL_TERMS.infoTerms}
      </Link>
      {LEGAL_TERMS.infoJoin}
      <Link
        href={LEGAL_DOCUMENTS.privacy.path}
        className="text-primary hover:underline"
      >
        {LEGAL_TERMS.infoPrivacy}
      </Link>
      {LEGAL_TERMS.infoEnd}
    </p>
  );
}
