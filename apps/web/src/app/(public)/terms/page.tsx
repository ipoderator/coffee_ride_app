import type { Metadata } from 'next';
import { LEGAL_TERMS } from 'ui';
import { LegalDocumentPage } from '@/features/legal/components/LegalDocumentPage';

// CR-247: required by Google's OAuth consent screen and linked under «Войти через
// Google». Indexable on purpose — it is a public document. CR-269: versioned;
// accepted with its own checkbox when an account is created (ADR-041).
export const metadata: Metadata = {
  title: `${LEGAL_TERMS.termsTitle} — Coffee Ride`,
};

export default function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  return (
    <LegalDocumentPage
      type="terms"
      title={LEGAL_TERMS.termsTitle}
      searchParams={searchParams}
    />
  );
}
