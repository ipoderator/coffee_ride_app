import { eq } from 'drizzle-orm';
import type { DbClient } from 'db';
import { legalAcceptances } from 'db/schema';
import {
  type ConsentDocumentType,
  currentLegalVersion,
  type LegalAcceptanceSource,
  type LegalConsents,
  pendingLegalDocuments,
} from 'types';

// CR-268 (ADR-041): accepting the legal documents. The versions a request carries
// are what the person's page showed; only the current version of each document is
// accepted — an older page gets `409 legal_version_outdated` and reloads — and what
// gets recorded is the registry's version and hash, never anything from the client.

export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];

export class LegalServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'LegalServiceError';
  }
}

/**
 * Every document in `required` must be present in `consents` at its current
 * version. Missing → `400 consent_required`; another version → `409
 * legal_version_outdated`.
 */
export function assertCurrentConsents(
  consents: Partial<LegalConsents>,
  required: readonly ConsentDocumentType[],
): void {
  for (const document of required) {
    const version = consents[document];
    if (version === undefined) {
      throw new LegalServiceError(
        'consent_required',
        400,
        'Consent required',
        `Acceptance of ${document} is required.`,
      );
    }
    if (version !== currentLegalVersion(document).version) {
      throw new LegalServiceError(
        'legal_version_outdated',
        409,
        'Legal document version outdated',
        `The accepted version of ${document} is not the current one.`,
      );
    }
  }
}

/**
 * Records the current version of each document as accepted by `userId`, inside
 * the caller's transaction. Idempotent: an existing row for the same version is
 * kept with its original `accepted_at`.
 */
export async function recordAcceptances(
  tx: DbTransaction | DbClient,
  userId: string,
  documents: readonly ConsentDocumentType[],
  source: LegalAcceptanceSource,
): Promise<void> {
  if (documents.length === 0) return;
  await tx
    .insert(legalAcceptances)
    .values(
      documents.map((document) => {
        const current = currentLegalVersion(document);
        return {
          userId,
          document,
          version: current.version,
          contentSha256: current.sha256,
          source,
        };
      }),
    )
    .onConflictDoNothing({
      target: [
        legalAcceptances.userId,
        legalAcceptances.document,
        legalAcceptances.version,
      ],
    });
}

/** The consent documents `userId` still has to accept. */
export async function pendingAcceptances(
  db: DbTransaction | DbClient,
  userId: string,
): Promise<ConsentDocumentType[]> {
  const rows = await db
    .select({
      document: legalAcceptances.document,
      version: legalAcceptances.version,
    })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, userId));
  return pendingLegalDocuments(rows);
}

/**
 * Re-consent by a signed-in person: the request must cover every pending
 * document at its current version; consents for documents not pending are
 * ignored. Returns what is still pending (nothing, on success).
 */
export async function acceptPendingDocuments(
  db: DbClient,
  userId: string,
  consents: Partial<LegalConsents>,
): Promise<ConsentDocumentType[]> {
  return db.transaction(async (tx) => {
    const pending = await pendingAcceptances(tx, userId);
    assertCurrentConsents(consents, pending);
    await recordAcceptances(tx, userId, pending, 'reconsent');
    return pendingAcceptances(tx, userId);
  });
}
