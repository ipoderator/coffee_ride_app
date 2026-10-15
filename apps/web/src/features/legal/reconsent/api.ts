import type {
  LegalAcceptanceState,
  LegalConsents,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };

const ACCEPTANCES_ENDPOINT = '/api/v1/legal/acceptances';

/**
 * CR-268 (ADR-041): accepts the pending documents at the versions this page
 * shows. `400 consent_required` if one is missing, `409 legal_version_outdated`
 * if the page is older than the documents.
 */
export async function acceptLegalDocuments(
  consents: Partial<LegalConsents>,
): Promise<LegalAcceptanceState> {
  const response = await fetch(ACCEPTANCES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consents }),
  });
  if (!response.ok) {
    throw new ApiError((await response.json()) as ProblemDetails);
  }
  return (await response.json()) as LegalAcceptanceState;
}
