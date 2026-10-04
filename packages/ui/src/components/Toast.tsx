'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// CR-103: `docs/design.md` §9 has listed `Toast` in `packages/ui`'s inventory since
// CR-063; nothing built it until now (KI-020). `RegistrationButton`'s register/cancel/
// waitlist actions are the first callers, giving them the success feedback the
// `/impeccable critique` P0 finding named.
//
// Context-based, not a standalone imperative singleton (no `toast.show()` module
// export) — `ToastProvider` mounts once at the app root (`apps/web/src/app/
// layout.tsx`) and every consumer reaches it through `useToast()`, same shape as any
// other React context in this codebase.
export type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** CR-170: fading out; removed once `EXIT_MS` has passed. */
  leaving?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

// Fails soft to a no-op rather than throwing when no `ToastProvider` ancestor exists.
// Most of this codebase's existing tests render a feature component directly
// (`render(<RideDetailView .../>)`, never the app root/layout.tsx that will carry the
// one real `ToastProvider`) — same "a non-critical UI feature never breaks a critical
// flow" precedent as the rest of `.claude/rules/resilience.md`, applied to a
// convenience notification instead of an external integration.
const noopToastContext: ToastContextValue = { showToast: () => {} };

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
};

const AUTO_DISMISS_MS = 4000;
// Matches `--animate-fade-out`; under reduced motion the toast simply stays
// this much longer, unanimated.
const EXIT_MS = 200;

/** CR-170: the success mark — a check that draws itself in after the toast
 * has risen (`check-draw`), instead of a decorative fill or glow. Decorative:
 * the message text carries the meaning. */
function SuccessMark() {
  return (
    <svg
      aria-hidden="true"
      data-toast-mark
      viewBox="0 0 16 16"
      className="mt-0.5 size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        pathLength={1}
        strokeDasharray={1}
        className="motion-safe:animate-check-draw"
      />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // CR-207: every pending auto-dismiss/exit timer, so unmounting clears them.
  // Without this a toast shown shortly before the provider goes away fires its
  // `setToasts` afterwards — in the browser a React "update on an unmounted
  // component", and under jsdom a hard `ReferenceError: window is not defined`
  // once the test environment is already torn down, which failed the whole
  // Vitest run (CI only: it needs the timer to outlive teardown).
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  // Keeps `timers` free of ids that already ran, so a long-lived provider
  // (the app root mounts one for the whole session) doesn't accumulate them.
  const schedule = useCallback((run: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, delayMs);
    timers.current.add(timer);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      schedule(() => {
        setToasts((current) =>
          current.map((toast) =>
            toast.id === id ? { ...toast, leaving: true } : toast,
          ),
        );
        schedule(() => dismissToast(id), EXIT_MS);
      }, AUTO_DISMISS_MS);
    },
    [dismissToast, schedule],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* `aria-live="polite"`/`role="status"`: acknowledges a completed action without
          interrupting whatever the viewer is doing next — same non-interrupting
          reasoning as `ErrorState`'s degraded (`variant="inline"`) case. */}
      {/* `--app-bottom-inset`: set by an app's bottom-edge chrome (apps/web's
          mobile tab bar, CR-130) so a toast lands above it, not under it. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--app-bottom-inset,0px))] z-50 md:bottom-4 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-md border px-4 py-3 text-body-sm shadow-overlay',
              toast.leaving
                ? 'motion-safe:animate-fade-out'
                : 'motion-safe:animate-rise-in',
              TONE_STYLES[toast.tone],
            )}
          >
            {toast.tone === 'success' ? <SuccessMark /> : null}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  return context ?? noopToastContext;
}
