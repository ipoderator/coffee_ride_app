import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SYSTEM_STATUS_TERMS } from 'ui';
import { SystemStatusScreen } from '@/components/site/SystemStatusScreen';
import { readMaintenanceConfig } from '@/lib/site/maintenance';

// CR-265: what `src/proxy.ts` rewrites every page to while `MAINTENANCE_MODE` is
// on — it sets the `503`, `Retry-After`, `no-store` and `noindex` headers; the root
// layout renders this alone, without the site header. With the mode off the path
// does not exist.
export const metadata: Metadata = {
  title: SYSTEM_STATUS_TERMS.maintenance.metaTitle,
  robots: { index: false },
};

export default function MaintenancePage() {
  if (!readMaintenanceConfig().enabled) notFound();
  return <SystemStatusScreen kind="maintenance" fullScreen />;
}
