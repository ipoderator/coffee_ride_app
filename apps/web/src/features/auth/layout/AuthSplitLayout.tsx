import type { ReactNode } from 'react';

/**
 * CR-262: the auth mockup's frame (`reference/coffee-ride-auth-mockup`) — on `lg`+
 * a story panel with a muted abstract route beside the form column; below `lg`
 * only the compact form column (`docs/design.md` §11: mobile first). The panel is
 * decoration plus one `h2`; the page's `h1` stays in the form column. Colours are
 * theme tokens, so it reads in light and dark alike.
 */
export function AuthSplitLayout({
  storyTitle,
  storyBody,
  children,
}: {
  storyTitle: string;
  storyBody: string;
  children: ReactNode;
}) {
  return (
    <main className="grid lg:min-h-175 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,35rem)]">
      <aside className="relative hidden flex-col justify-center overflow-hidden border-border bg-surface px-12 py-18 lg:flex lg:border-r xl:px-24">
        <AbstractRoute />
        <div className="relative max-w-160">
          <h2 className="font-title text-display text-text">{storyTitle}</h2>
          <p className="mt-5 max-w-135 text-body text-text-secondary">
            {storyBody}
          </p>
        </div>
      </aside>
      <section className="flex justify-center px-5 pt-8 pb-16 sm:items-center sm:px-8 sm:py-12">
        {/* 30.5rem: «Продолжить с Яндекс ID» stays on one line, with room, at two columns. */}
        <div className="w-full max-w-122">{children}</div>
      </section>
    </main>
  );
}

/** The mockup's contour lines and route ribbon, toned down and purely decorative. */
function AbstractRoute() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 900 900"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full translate-x-[8%] translate-y-[28%] scale-[1.08] opacity-60"
    >
      <path
        d="M-120 750 C80 540 238 700 395 515 S682 270 1010 418"
        className="fill-none stroke-bg"
        strokeWidth={132}
        strokeLinecap="round"
      />
      {[
        'M-84 255 C92 92 261 144 381 302 S615 541 976 289',
        'M-115 305 C76 131 247 188 357 342 S604 590 995 332',
        'M-136 359 C64 174 228 236 334 383 S586 640 1019 381',
      ].map((d) => (
        <path
          key={d}
          d={d}
          className="fill-none stroke-border opacity-50"
          strokeWidth={1.5}
        />
      ))}
      <path
        d="M-80 704 C99 528 229 664 391 491 S688 252 978 397"
        className="fill-none stroke-route opacity-40"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M-72 724 C113 548 238 688 410 508 S705 279 991 421"
        className="fill-none stroke-primary opacity-25"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle
        cx="42"
        cy="609"
        r="13"
        className="fill-surface stroke-route opacity-45"
        strokeWidth={3}
      />
      <circle
        cx="787"
        cy="313"
        r="13"
        className="fill-surface stroke-route opacity-45"
        strokeWidth={3}
      />
    </svg>
  );
}
