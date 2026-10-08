import type { Metadata } from 'next';
import { SITE_META_TERMS } from 'ui';

// QA live audit 2026-10-08, item 7. A page's own `openGraph` replaces the
// layout's whole object (Next merges metadata shallowly), so pages spread
// this in rather than repeating the site-wide fields.
export const SITE_OPEN_GRAPH = {
  type: 'website',
  siteName: SITE_META_TERMS.siteName,
  locale: 'ru_RU',
} satisfies NonNullable<Metadata['openGraph']>;

/** Auth and account pages: nothing a search result should land on. */
export const NO_INDEX: Metadata['robots'] = { index: false, follow: false };
