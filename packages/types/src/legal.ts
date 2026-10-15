import { z } from 'zod';

// CR-269 (ADR-041): the legal documents and their versions — one registry shared by
// `apps/web` (which renders each version's text, `apps/web/src/features/legal/`)
// and `apps/api` (which validates the versions a person accepted and records them).
//
// A version is immutable: its `sha256` pins the exact text (SHA-256 of the version's
// content object as JSON — `apps/web`'s `legal-content.test.ts` recomputes it), and
// that hash is stored with every acceptance, so a record always proves which text
// was accepted. Changing a document's text means adding a version here — never
// editing one. `material: true` marks a version every person must accept again;
// a wording fix is `material: false` and asks nobody.

/** A first Google/Yandex sign-in accepts the documents here (no account yet). */
export const OAUTH_SIGNUP_CONSENT_PATH = '/register/consent';
/** A signed-in person accepts a material new version here. */
export const LEGAL_UPDATE_PATH = '/legal-update';

/** Every public legal document. */
export const LEGAL_DOCUMENT_TYPES = [
  'terms',
  'privacy',
  'personal_data_consent',
] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

/**
 * The documents a person accepts. The privacy policy is information, not an
 * agreement: the consent to processing is its own document (152-ФЗ, ст. 9).
 */
export const CONSENT_DOCUMENT_TYPES = [
  'terms',
  'personal_data_consent',
] as const;
export type ConsentDocumentType = (typeof CONSENT_DOCUMENT_TYPES)[number];

/** Where an acceptance came from (`legal_acceptances.source`). */
export const LEGAL_ACCEPTANCE_SOURCES = [
  'register_password',
  'oauth_google',
  'oauth_yandex',
  'reconsent',
] as const;
export type LegalAcceptanceSource = (typeof LEGAL_ACCEPTANCE_SOURCES)[number];

export interface LegalDocumentVersion {
  /** Immutable identifier, e.g. `1.0`. */
  version: string;
  /** ISO date the version takes effect. */
  effectiveAt: string;
  /** SHA-256 (hex) of the version's content as JSON. */
  sha256: string;
  /** A new version everyone must accept again. */
  material: boolean;
  /** What changed, for the version history. */
  summary: string;
}

export interface LegalDocumentMeta {
  path: string;
  /** Oldest first; the last one is current. */
  versions: readonly LegalDocumentVersion[];
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocumentMeta> = {
  terms: {
    path: '/terms',
    versions: [
      {
        version: '1.0',
        effectiveAt: '2026-10-15',
        sha256:
          '9770db6170acdcdba94ab4a9e34b220697669876ccb336a95b377bacd876dd7b',
        material: true,
        summary:
          'Полная редакция: возраст, безопасность заездов, запреты, модерация и обжалование, отмены, сторонние сервисы, прекращение аккаунта, применимое право. Принимается отдельной отметкой при создании аккаунта. Заменяет краткую редакцию от 14 октября 2026 г.',
      },
    ],
  },
  privacy: {
    path: '/privacy',
    versions: [
      {
        version: '1.0',
        effectiveAt: '2026-10-15',
        sha256:
          '02271fdb2cb3e0e8f966ecc4ad7d77016212d2a0cb113dd6b481590c796ace05',
        material: true,
        summary:
          'Полная редакция: цели и правовые основания, получатели, сроки хранения по категориям, reCAPTCHA, журнал принятия документов, защита, права и инциденты. Согласие на обработку вынесено в отдельный документ. Заменяет краткую редакцию от 14 октября 2026 г.',
      },
    ],
  },
  personal_data_consent: {
    path: '/personal-data-consent',
    versions: [
      {
        version: '1.0',
        effectiveAt: '2026-10-15',
        sha256:
          '960f990590a6e7a7368a14f7bb267c3678f30c4fb72f8c40c5eb69726fcad030',
        material: true,
        summary:
          'Первая редакция отдельного согласия на обработку персональных данных.',
      },
    ],
  },
};

export function currentLegalVersion(
  type: LegalDocumentType,
): LegalDocumentVersion {
  const { versions } = LEGAL_DOCUMENTS[type];
  const current = versions[versions.length - 1];
  if (!current) throw new Error(`No versions for legal document ${type}.`);
  return current;
}

export function findLegalVersion(
  type: LegalDocumentType,
  version: string,
): LegalDocumentVersion | null {
  return (
    LEGAL_DOCUMENTS[type].versions.find((v) => v.version === version) ?? null
  );
}

/**
 * Whether an accepted `version` still counts: it is the latest material version
 * or one published after it (a non-material wording fix keeps earlier
 * acceptances valid). An unknown version never counts.
 */
export function isLegalAcceptanceCurrent(
  type: ConsentDocumentType,
  version: string,
): boolean {
  const { versions } = LEGAL_DOCUMENTS[type];
  const accepted = versions.findIndex((v) => v.version === version);
  if (accepted === -1) return false;
  let lastMaterial = 0;
  versions.forEach((v, index) => {
    if (v.material) lastMaterial = index;
  });
  return accepted >= lastMaterial;
}

/** The consent documents still to accept, given the versions already accepted. */
export function pendingLegalDocuments(
  accepted: readonly { document: string; version: string }[],
): ConsentDocumentType[] {
  return CONSENT_DOCUMENT_TYPES.filter(
    (type) =>
      !accepted.some(
        (row) =>
          row.document === type && isLegalAcceptanceCurrent(type, row.version),
      ),
  );
}

// The version of each consent document the person ticked, exactly as the page
// showed it. The API accepts only the current versions (`409
// legal_version_outdated` otherwise — the page was older than the documents),
// never a bare `true`: the record must say which text was accepted.
const acceptedVersionSchema = z.string().min(1).max(32);

/** Both consents — account creation (password register, first OAuth sign-in). */
export const legalConsentsSchema = z.object({
  terms: acceptedVersionSchema,
  personal_data_consent: acceptedVersionSchema,
});
export type LegalConsents = z.infer<typeof legalConsentsSchema>;

/** Re-consent: the pending documents only; the API checks which are pending. */
export const legalAcceptRequestSchema = z.object({
  consents: legalConsentsSchema.partial(),
});
export type LegalAcceptRequest = z.infer<typeof legalAcceptRequestSchema>;

/** `GET /v1/auth/me`'s `legal` and `POST /v1/legal/acceptances`'s answer. */
export interface LegalAcceptanceState {
  /** Consent documents whose current version this person has not accepted. */
  pending: ConsentDocumentType[];
}

/** The current version of every consent document — what a fresh form sends. */
export function currentLegalConsents(): LegalConsents {
  return {
    terms: currentLegalVersion('terms').version,
    personal_data_consent: currentLegalVersion('personal_data_consent').version,
  };
}

// The `code`s of the API's consent refusals.
export const LEGAL_ERROR_CODES = [
  // A pending document's consent is missing from the request (`400`).
  'consent_required',
  // A version is not the current one (`409`) — reload the documents.
  'legal_version_outdated',
  // A signed-in person must accept updated documents first (`403`).
  'legal_acceptance_required',
] as const;
export type LegalErrorCode = (typeof LEGAL_ERROR_CODES)[number];
