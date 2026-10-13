import type { Metadata } from 'next';
import { LEGAL_TERMS } from 'ui';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import { TERMS_OF_USE } from '@/features/legal/content';

// CR-247: required by Google's OAuth consent screen and linked under «Войти через
// Google». Indexable on purpose — it is a public document.
export const metadata: Metadata = {
  title: `${LEGAL_TERMS.termsTitle} — Coffee Ride`,
};

export default function TermsPage() {
  return (
    <LegalDocument title={LEGAL_TERMS.termsTitle} content={TERMS_OF_USE} />
  );
}
