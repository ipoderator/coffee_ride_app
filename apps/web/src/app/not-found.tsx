import type { Metadata } from 'next';
import { NOT_FOUND_TERMS } from 'ui';
import { NotFoundPanel } from '@/components/site/NotFoundPanel';

// QA live audit 2026-10-08, item 5: every unknown URL got Next's default 404 —
// English, unstyled, no way back. Renders inside the root layout, so the
// header, fonts and the chosen theme apply.
export const metadata: Metadata = {
  title: NOT_FOUND_TERMS.metaTitle,
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main>
      <NotFoundPanel
        title={NOT_FOUND_TERMS.pageTitle}
        description={NOT_FOUND_TERMS.pageDescription}
      />
    </main>
  );
}
