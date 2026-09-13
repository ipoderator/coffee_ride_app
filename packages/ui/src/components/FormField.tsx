import { cloneElement, type ReactElement } from 'react';
import { cn } from '../lib/cn';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export interface FormFieldProps {
  /** Also used to derive the hint/error element ids for `aria-describedby`. */
  id: string;
  label: string;
  /** Field-level error — client or server validation
   * (`.claude/rules/frontend.md` Forms section). Takes over from `hint` when set. */
  error?: string;
  hint?: string;
  className?: string;
  /** Exactly one form control (`Input`, or anything accepting the same three
   * a11y props) — cloned with `id`/`aria-describedby`/`aria-invalid` wired in,
   * so every field gets a real `<label>` and linked error text
   * (`.claude/rules/frontend.md`, docs/design.md §12) without repeating that
   * wiring at every call site. */
  children: ReactElement<ControlProps>;
}

export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  // `error` takes over from `hint` (below) — only whichever is actually
  // rendered belongs in `aria-describedby`.
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error),
      })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
