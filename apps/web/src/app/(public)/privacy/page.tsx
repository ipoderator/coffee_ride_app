import type { Metadata } from 'next';
import { LEGAL_TERMS } from 'ui';
import { LegalDocumentPage } from '@/features/legal/components/LegalDocumentPage';

// CR-247: required by Google's OAuth consent screen and linked under «Войти через
// Google». Indexable on purpose — it is a public document. CR-269: versioned;
// information only — the consent is `/personal-data-consent` (ADR-041).
export const metadata: Metadata = {
  title: `${LEGAL_TERMS.privacyTitle} — Coffee Ride`,
};

export default function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  return (
    <LegalDocumentPage
      type="privacy"
      title={LEGAL_TERMS.privacyHeading}
      searchParams={searchParams}
    />
  );
}
