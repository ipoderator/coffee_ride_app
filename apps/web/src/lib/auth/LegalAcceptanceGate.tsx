'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  LEGAL_DOCUMENTS,
  LEGAL_UPDATE_PATH,
  OAUTH_SIGNUP_CONSENT_PATH,
} from 'types';
import { useSession } from './session-context';
import { legalUpdateHref, safeNextPath } from './next-path';

// CR-269 (ADR-041): pages that stay open while documents wait for re-acceptance —
// the documents themselves and the acceptance page (sign-out is the header's
// button, deletion a mailto on `/legal-update`). `/maintenance` renders without a
// session anyway.
const OPEN_PATHS = new Set<string>([
  LEGAL_UPDATE_PATH,
  OAUTH_SIGNUP_CONSENT_PATH,
  '/maintenance',
  ...Object.values(LEGAL_DOCUMENTS).map((document) => document.path),
]);

export function isOpenDuringReconsent(pathname: string): boolean {
  return OPEN_PATHS.has(pathname);
}

/**
 * Where to come back to after accepting: this page — or, when the session resolved
 * while still on `/login`/`/register` (which never make a valid `next`), the page
 * that sign-in was heading to.
 */
export function returnTarget(pathname: string, search: string): string | null {
  const here = safeNextPath(`${pathname}${search}`);
  return here ?? safeNextPath(new URLSearchParams(search).get('next'));
}

/**
 * Sends a signed-in person with a material new version pending to `/legal-update`,
 * keeping where they were as `next`. A UI convenience: the API refuses their
 * changes (`403 legal_acceptance_required`) whatever the browser does.
 */
export function LegalAcceptanceGate() {
  const { status, legalPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const mustAccept = status === 'authenticated' && legalPending.length > 0;

  useEffect(() => {
    if (!mustAccept || isOpenDuringReconsent(pathname)) return;
    router.replace(
      legalUpdateHref(returnTarget(pathname, window.location.search)),
    );
  }, [mustAccept, pathname, router]);

  return null;
}
