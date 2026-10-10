import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ADMIN_TERMS, ErrorState } from 'ui';
import { CabinetShell } from '@/components/cabinet/CabinetShell';
import { ADMIN_NAV_ITEMS } from '@/lib/admin/admin-nav';
import { lookupAdminAccess } from '@/lib/admin/server-admin';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: `${ADMIN_TERMS.sectionTitle} — Coffee Ride`,
  robots: NO_INDEX,
};

// CR-231 (ADR-032): the `/admin` gate. Anyone without the capability — signed
// out included — gets the site's real 404, so the section does not announce
// itself; an API that could not answer gets an error, never the section.
// Every admin call is still authorized by `apps/api` on its own. No
// `loading.tsx` may sit above this layout: streaming would answer 200 before
// `notFound()` runs (same as `/rides/[id]`, CR-224).
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await lookupAdminAccess();
  if (access === 'denied') notFound();
  if (access === 'unknown') {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <ErrorState message={ADMIN_TERMS.accessCheckFailed} />
      </main>
    );
  }
  return (
    <CabinetShell sidebarNavItems={ADMIN_NAV_ITEMS}>{children}</CabinetShell>
  );
}
