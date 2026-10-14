'use client';

import { Button, buttonClassName, cn, SYSTEM_STATUS_TERMS, Wordmark } from 'ui';
import { SITE_CONTACT_EMAIL } from '@/lib/site/contact';

export type SystemStatusKind = 'maintenance' | 'error';

const DOT_CLASS: Record<SystemStatusKind, string> = {
  maintenance: 'bg-warning-fill',
  error: 'bg-danger',
};

/**
 * CR-265: the auth mockup's «Техработы» tab (`reference/coffee-ride-auth-mockup`)
 * — the wordmark, the title, a calm line about the data, «Обновить страницу»,
 * «Написать нам» and the status line; no route line, points or illustration. The
 * unexpected-error state is the same frame with its own text and a red status dot
 * (the status is also said in words). Neither shows a cause: no message, code or
 * digest reaches the page.
 *
 * `fullScreen`: the maintenance page and `global-error` stand alone (no site
 * header), so the screen takes the whole viewport; the in-app error state sits
 * under the header.
 */
export function SystemStatusScreen({
  kind,
  fullScreen = false,
}: {
  kind: SystemStatusKind;
  fullScreen?: boolean;
}) {
  const terms = SYSTEM_STATUS_TERMS[kind];
  return (
    <main
      className={cn(
        'grid place-items-center bg-[radial-gradient(circle_at_50%_20%,color-mix(in_srgb,var(--primary-fill)_18%,transparent),transparent_34rem)] px-5 pt-6 pb-16 sm:p-8',
        fullScreen ? 'min-h-dvh' : 'min-h-[70dvh]',
      )}
    >
      <div className="w-full max-w-190 text-center">
        <div className="mb-6 flex justify-center">
          <Wordmark className="text-[1.375rem]" />
        </div>
        <h1 className="font-title text-display text-text">{terms.title}</h1>
        <p className="mx-auto mt-4.5 max-w-147.5 text-body text-text-secondary">
          {terms.body}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {/* A full reload, not a client re-render: it also clears whatever state
              the failure left behind, and during maintenance asks the server again. */}
          <Button className="px-6.5" onClick={() => window.location.reload()}>
            {SYSTEM_STATUS_TERMS.refresh}
          </Button>
          <a
            href={`mailto:${SITE_CONTACT_EMAIL}`}
            className={buttonClassName('secondary')}
          >
            {SYSTEM_STATUS_TERMS.contact}
          </a>
        </div>
        <p className="mt-6 inline-flex items-center gap-2 text-body-sm text-text-muted">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[kind])}
          />
          {terms.status}
        </p>
      </div>
    </main>
  );
}
