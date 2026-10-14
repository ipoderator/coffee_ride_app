'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { PASSWORD_TERMS } from '../terminology';
import { Input, type InputProps } from './Input';

export type PasswordInputProps = Omit<InputProps, 'type'>;

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}

/**
 * CR-262: a password `Input` with a show/hide toggle (the auth mockup's «глаз»).
 * Takes every `Input` prop, so `FormField` wires `id`/`aria-describedby`/
 * `aria-invalid` onto the real `<input>` as before. The toggle is a separate,
 * labelled button (`aria-pressed`) after the field in tab order; it never
 * submits the form.
 */
export function PasswordInput({
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        disabled={disabled}
        aria-pressed={visible}
        aria-label={visible ? PASSWORD_TERMS.hide : PASSWORD_TERMS.show}
        className={cn(
          'absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  );
}
