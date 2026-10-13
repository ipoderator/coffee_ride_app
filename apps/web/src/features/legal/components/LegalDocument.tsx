import { formatDate, LEGAL_TERMS } from 'ui';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED_AT,
  type LegalDocumentContent,
} from '../content';

/**
 * CR-247: `/privacy` and `/terms` — one `<h1>` (docs/design.md §12), a section per
 * `<h2>`, the wording date and the contact address. A server component: plain text,
 * nothing interactive.
 */
export function LegalDocument({
  title,
  content,
}: {
  title: string;
  content: LegalDocumentContent;
}) {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-h1 text-text">{title}</h1>
        <p className="text-body-sm text-text-secondary">
          {LEGAL_TERMS.updatedLabel}{' '}
          {/* A legal wording always names its year: `now` far from it forces it. */}
          {formatDate(new Date(LEGAL_UPDATED_AT), { now: new Date(0) })}
        </p>
        {content.intro.map((paragraph) => (
          <p key={paragraph} className="text-body text-text">
            {paragraph}
          </p>
        ))}
      </header>
      {content.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-h3 text-text">{section.heading}</h2>
          {section.items ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-text">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-body text-text">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
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
