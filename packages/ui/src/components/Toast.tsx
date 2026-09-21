'use client';

import {
  createContext,
  useCallback,
  useContext,
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* `aria-live="polite"`/`role="status"`: acknowledges a completed action without
          interrupting whatever the viewer is doing next — same non-interrupting
          reasoning as `ErrorState`'s degraded (`variant="inline"`) case. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-md border px-4 py-3 text-sm shadow-overlay',
              TONE_STYLES[toast.tone],
            )}
          >
            {toast.message}
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
