import type { Metadata } from 'next';
import { LEGAL_TERMS } from 'ui';
import { LegalDocumentPage } from '@/features/legal/components/LegalDocumentPage';

// CR-268 (ADR-041): the separate consent to processing that the second checkbox
// on `/register` and `/register/consent` accepts. Public and indexable, like the
// other documents.
export const metadata: Metadata = {
  title: `${LEGAL_TERMS.personalDataConsentTitle} — Coffee Ride`,
};

export default function PersonalDataConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  return (
    <LegalDocumentPage
      type="personal_data_consent"
      title={LEGAL_TERMS.personalDataConsentTitle}
      searchParams={searchParams}
    />
  );
}
