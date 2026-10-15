import { currentLegalConsents } from 'types';

// CR-269 (ADR-041): every account a test creates through `POST /v1/auth/register`
// accepts the current documents, as the real form does.
export const CONSENTS = currentLegalConsents();
