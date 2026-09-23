'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

// CR-108. The global header groups each cabinet's ADR-009 nav registry behind
// one trigger, so it needs a real menu primitive — `docs/design.md` §9's
// inventory has never listed one, and hand-rolling a third ad hoc popover in
// `apps/web` is exactly what `packages/ui` exists to prevent.
//
// Hand-vendored against our own tokens, no Radix/headless-ui dependency — same
// precedent `Dialog`/`Toast` (CR-103) set. Framework-neutral on purpose: it
// never imports `next/link`, so the consumer supplies its own links (see
// `NAV_MENU_ITEM_CLASSNAME`).

/**
 * Styling + semantics for one item inside a {@link NavMenu}. The consumer
 * applies it to its own element (`next/link`'s `Link`, an `<a>`, a `<button>`)
 * and adds `role="menuitem"` — `packages/ui` stays router-agnostic, and a
 * shared constant keeps the several call sites from drifting (same precedent as
 * CR-107's `GLASS_PANEL_CLASSNAME`).
 */
export const NAV_MENU_ITEM_CLASSNAME =
  'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-text-secondary hover:bg-bg hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

export interface NavMenuProps {
  /** The trigger's visible text, and its accessible name. */
  label: string;
  /** Optional leading icon for the trigger, already sized by the caller. */
  icon?: ReactNode;
  /** `role="menuitem"` elements — see {@link NAV_MENU_ITEM_CLASSNAME}. */
  children: ReactNode;
  /** Marks the trigger as the current section. Styling only: the real
   * `aria-current` belongs on the active item inside the menu. */
  active?: boolean;
  /** Renders `label` for assistive tech only, leaving `icon` as the visible
   * trigger. For a control whose icon already says what it is (the theme
   * switch) and whose word would just crowd the bar — never for a section
   * whose meaning depends on reading it. */
  labelHidden?: boolean;
  className?: string;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

export function NavMenu({
  label,
  icon,
  children,
  active = false,
  labelHidden = false,
  className,
}: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      // An outside click already moves focus wherever the user clicked, so
      // pulling it back to the trigger would fight them.
      close(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  function focusItem(index: number) {
    const items =
      menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR);
    if (!items || items.length === 0) return;
    // Wrap around in both directions, the behavior a menu's arrow keys are
    // expected to have.
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function openAndFocus(index: number) {
    setOpen(true);
    // The menu only exists in the DOM once `open` is true, so the focus move
    // has to wait for that render to commit.
    requestAnimationFrame(() => focusItem(index));
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAndFocus(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAndFocus(-1);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === 'Tab') {
      // Tab moves on past the whole menu rather than through it, so the menu
      // should not still be sitting open behind the user.
      close(false);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          active ? 'text-text' : 'text-text-secondary hover:text-text',
        )}
      >
        {icon}
        <span className={cn(labelHidden && 'sr-only')}>{label}</span>
        {/* Inline rather than `lucide-react`: that package is `apps/web`'s
            dependency, not this one's, and CR-106 deliberately kept icon
            resolution on the app side. One chevron is not worth making the
            shared package depend on an icon library. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'h-4 w-4 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          // Every item in this menu navigates, so any activation inside it
          // should also dismiss it — one delegated handler instead of asking
          // each consumer to remember an `onClick`.
          onClick={() => close(false)}
          className="absolute right-0 z-20 mt-1 flex min-w-56 flex-col gap-0.5 rounded-lg border border-border bg-bg-raised p-1 shadow-overlay"
        >
          {children}
        </div>
      )}
    </div>
  );
}
