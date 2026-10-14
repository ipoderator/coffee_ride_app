import type { ReactNode } from 'react';

/**
 * CR-262: the auth mockup's frame (`reference/coffee-ride-auth-mockup`) — on `lg`+
 * a story column beside the form column; below `lg` only the compact form column
 * (`docs/design.md` §11: mobile first). The story column is text alone on the page
 * background — no panel fill, border or decorative route (owner, CR-263); its `h2`
 * sits beside the page's `h1`, which stays in the form column.
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
      <aside className="hidden flex-col justify-center px-12 py-18 lg:flex xl:px-24">
        <div className="max-w-160">
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
