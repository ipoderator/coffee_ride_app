// CR-247, CR-268: the shape of a legal document's text. Plain strings only — the
// version's SHA-256 (`packages/types`' `LEGAL_DOCUMENTS`) is taken over this object
// as JSON, so what is hashed is exactly what the page shows.

export interface LegalSection {
  heading: string;
  /** Before the list. */
  paragraphs?: readonly string[];
  items?: readonly string[];
  /** After the list. */
  notes?: readonly string[];
}

export interface LegalDocumentContent {
  intro: readonly string[];
  sections: readonly LegalSection[];
}
