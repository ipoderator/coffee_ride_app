import { notFound } from 'next/navigation';
import { findLegalVersion, type LegalDocumentType } from 'types';
import { LegalDocument } from './LegalDocument';

/**
 * CR-268: the body of a legal page — the current version, or an earlier one by
 * `?version=` (the history links); an unknown version is a 404, not the current
 * text under someone else's number.
 */
export async function LegalDocumentPage({
  type,
  title,
  searchParams,
}: {
  type: LegalDocumentType;
  title: string;
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const requested = (await searchParams).version;
  if (requested === undefined)
    return <LegalDocument type={type} title={title} />;
  if (typeof requested !== 'string' || !findLegalVersion(type, requested)) {
    notFound();
  }
  return <LegalDocument type={type} title={title} version={requested} />;
}
