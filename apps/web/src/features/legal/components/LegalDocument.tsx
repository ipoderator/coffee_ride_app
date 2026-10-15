import Link from 'next/link';
import {
  currentLegalVersion,
  LEGAL_DOCUMENTS,
  type LegalDocumentType,
  type LegalDocumentVersion,
} from 'types';
import { LEGAL_TERMS, Notice } from 'ui';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENT_TEXT } from '../content';
import { formatLegalDate } from '../format';

/**
 * CR-247: `/privacy`, `/terms`; CR-269: `/personal-data-consent`, a version line, a
 * notice on an earlier version and the version history. One `<h1>`
 * (docs/design.md §12), a section per `<h2>`, the contact address. A server
 * component: plain text and links, nothing interactive.
 */
export function LegalDocument({
  type,
  title,
  version = currentLegalVersion(type).version,
}: {
  type: LegalDocumentType;
  title: string;
  /** A published version (the page 404s on an unknown one); the current by default. */
  version?: string;
}) {
  const { path, versions } = LEGAL_DOCUMENTS[type];
  const current = currentLegalVersion(type);
  const shown: LegalDocumentVersion =
    versions.find((v) => v.version === version) ?? current;
  const content = LEGAL_DOCUMENT_TEXT[type][shown.version];
  if (!content) throw new Error(`No text for ${type} ${shown.version}.`);
  const isCurrent = shown.version === current.version;

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-3">
        {/* «конфиденциальности» is wider than a 320px screen at h1 size. */}
        <h1 className="text-h1 break-words hyphens-auto text-text">{title}</h1>
        <p className="text-body-sm text-text-secondary">
          {LEGAL_TERMS.versionLine(
            shown.version,
            formatLegalDate(shown.effectiveAt),
          )}
        </p>
        {!isCurrent && (
          <Notice title={LEGAL_TERMS.archivedNotice}>
            <Link
              href={path}
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              {LEGAL_TERMS.archivedCurrentLink}
            </Link>
          </Notice>
        )}
        {content.intro.map((paragraph) => (
          <p key={paragraph} className="text-body text-text">
            {paragraph}
          </p>
        ))}
      </header>
      {content.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-h3 text-text">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-body text-text">
              {paragraph}
            </p>
          ))}
          {section.items ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-text">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.notes?.map((note) => (
            <p key={note} className="text-body text-text">
              {note}
            </p>
          ))}
        </section>
      ))}
      <section
        aria-labelledby="legal-history"
        className="flex flex-col gap-3 border-t border-border pt-6"
      >
        <h2 id="legal-history" className="text-h3 text-text">
          {LEGAL_TERMS.historyTitle}
        </h2>
        <ol className="flex flex-col gap-4">
          {[...versions].reverse().map((entry) => {
            const label = LEGAL_TERMS.historyVersion(
              entry.version,
              formatLegalDate(entry.effectiveAt),
            );
            const href =
              entry.version === current.version
                ? path
                : `${path}?version=${encodeURIComponent(entry.version)}`;
            return (
              <li key={entry.version} className="flex flex-col gap-1">
                <p className="text-body text-text">
                  {entry.version === shown.version ? (
                    <span className="font-semibold" aria-current="page">
                      {label}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      className="font-medium text-primary hover:underline"
                    >
                      {label}
                    </Link>
                  )}
                  {entry.version === current.version && (
                    <span className="text-text-secondary">
                      {' '}
                      — {LEGAL_TERMS.historyCurrent}
                    </span>
                  )}
                </p>
                <p className="text-body-sm text-text-secondary">
                  {entry.summary}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
      <footer className="border-t border-border pt-6 text-body text-text">
        {LEGAL_TERMS.contactLabel}:{' '}
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          className="text-primary hover:underline"
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
      </footer>
    </article>
  );
}
