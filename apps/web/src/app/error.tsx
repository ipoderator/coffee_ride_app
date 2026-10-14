'use client';

import { SYSTEM_STATUS_TERMS } from 'ui';
import { SystemStatusScreen } from '@/components/site/SystemStatusScreen';

// CR-265: the unexpected-error state for every page under the root layout — the
// site header stays, the page's place takes the maintenance screen's frame with
// its own text. The `error` prop is deliberately unused: its message, digest and
// stack never reach the page (Next already logs a server error with its digest).
export default function Error() {
  return (
    <>
      <title>{SYSTEM_STATUS_TERMS.error.metaTitle}</title>
      <SystemStatusScreen kind="error" />
    </>
  );
}
