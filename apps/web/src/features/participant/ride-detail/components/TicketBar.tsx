'use client';

import { type RefObject, useEffect, useState } from 'react';
import { Button, cn } from 'ui';

export interface TicketBarContent {
  title: string;
  subtitle: string;
  action: string;
  /** Registered: a quiet «Детали», not a second primary button. */
  variant: 'primary' | 'secondary';
}

/**
 * CR-151: the phone's bottom bar — shown only once the ticket has scrolled up
 * out of view (on a phone the ticket sits right under the hero, so the bar
 * would otherwise duplicate what is already on screen). Its button scrolls
 * back to the ticket instead of acting itself: one set of registration
 * controls, one pending/error state. Hidden from `lg`, where the ticket is a
 * sticky aside; `inert` + `aria-hidden` while off-screen, so neither focus nor
 * a screen reader lands on it.
 */
export function TicketBar({
  ticketRef,
  content,
}: {
  ticketRef: RefObject<HTMLElement | null>;
  content: TicketBarContent | null;
}) {
  const [shown, setShown] = useState(false);
  // The observer only cares whether there is a bar at all — `content` is a
  // fresh object on every parent render.
  const hasContent = content !== null;

  useEffect(() => {
    const ticket = ticketRef.current;
    if (!hasContent || !ticket || typeof IntersectionObserver === 'undefined') {
      setShown(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(ticket);
    return () => observer.disconnect();
  }, [ticketRef, hasContent]);

  if (!content) return null;

  return (
    <div
      data-testid="ticket-bar"
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-frame bg-bg-raised px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-overlay transition-transform duration-250 ease-out motion-reduce:transition-none lg:hidden',
        shown ? 'translate-y-0' : 'translate-y-[110%]',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[15px] text-text">
            {content.title}
          </b>
          <span className="block truncate text-[13px] text-text-secondary">
            {content.subtitle}
          </span>
        </div>
        <Button
          variant={content.variant}
          onClick={() =>
            ticketRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }
        >
          {content.action}
        </Button>
      </div>
    </div>
  );
}
