import type { Metadata } from 'next';
import { LEGAL_TERMS } from 'ui';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import { PRIVACY_POLICY } from '@/features/legal/content';

// CR-247: required by Google's OAuth consent screen and linked under «Войти через
// Google». Indexable on purpose — it is a public document.
export const metadata: Metadata = {
  title: `${LEGAL_TERMS.privacyTitle} — Coffee Ride`,
};

export default function PrivacyPage() {
  return (
    <LegalDocument title={LEGAL_TERMS.privacyTitle} content={PRIVACY_POLICY} />
  );
}
