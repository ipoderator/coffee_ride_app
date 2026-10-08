import { RIDE_DETAIL_TERMS } from 'ui';
import { NotFoundPanel } from '@/components/site/NotFoundPanel';

// QA live audit 2026-10-08, item 4: `page.tsx` calls `notFound()` on the
// API's `404`, so a missing (or someone else's draft) ride answers HTTP 404.
export default function RideNotFound() {
  return (
    <main>
      <NotFoundPanel
        title={RIDE_DETAIL_TERMS.notFoundTitle}
        description={RIDE_DETAIL_TERMS.notFoundDescription}
      />
    </main>
  );
}
