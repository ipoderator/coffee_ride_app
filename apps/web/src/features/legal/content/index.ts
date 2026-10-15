import type { LegalDocumentType } from 'types';
import { PERSONAL_DATA_CONSENT_VERSIONS } from './personal-data-consent';
import { PRIVACY_POLICY_VERSIONS } from './privacy';
import { TERMS_OF_USE_VERSIONS } from './terms';
import type { LegalDocumentContent } from './types';

export { LEGAL_CONTACT_EMAIL, LEGAL_SITE } from './operator';
export type { LegalDocumentContent, LegalSection } from './types';

/**
 * CR-269 (ADR-041): every published version's text, by document. `packages/types`'
 * `LEGAL_DOCUMENTS` lists the versions and their hashes; `legal-content.test.ts`
 * checks each listed version has its text here, hashing to the listed SHA-256.
 */
export const LEGAL_DOCUMENT_TEXT: Record<
  LegalDocumentType,
  Record<string, LegalDocumentContent>
> = {
  terms: TERMS_OF_USE_VERSIONS,
  privacy: PRIVACY_POLICY_VERSIONS,
  personal_data_consent: PERSONAL_DATA_CONSENT_VERSIONS,
};
