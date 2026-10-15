import { SITE_CONTACT_EMAIL } from '@/lib/site/contact';

// CR-268: who stands behind the documents. Only what the repository can confirm is
// stated: the site and the contact address. The operator's legal name, ИНН/ОГРН and
// postal address, and the hosting provider's country, are the owner's to supply
// (`docs/changelog.md` → CR-268, «Needs owner input»); adding them changes the
// documents' text, so it means a new version in `packages/types`' registry.
export const LEGAL_SITE = 'coffeeride.site';
export const LEGAL_CONTACT_EMAIL = SITE_CONTACT_EMAIL;
