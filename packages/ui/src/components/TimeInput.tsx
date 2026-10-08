'use client';

import { useEffect, useRef, type Ref } from 'react';
import { Input, type InputProps } from './Input';

export interface TimeInputProps extends Omit<
  InputProps,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'ref'
> {
  /** `"HH:MM"` — the value the form last set (a loaded draft, a server echo). */
  value: string;
  onValueChange: (value: string) => void;
  /** The live `<input>` — read `.value` when saving (see below). */
  ref?: Ref<HTMLInputElement>;
}

/**
 * A native `<input type="time">` the browser owns (QA live audit 2026-10-08,
 * item 1). A controlled time input loses whatever the native control shows but
 * React never heard about — a picker, autofill or assistive tool that changes
 * the field without an `input` event: the next re-render (e.g. picking a GPX
 * file) wrote the stale state back over the field, and the save sent that
 * stale value (an «08:00» on screen saved as «12:12»). Here React only writes
 * the field when `value` itself changes, and a form reads the field through
 * `ref` when it saves — what is on screen is what is sent.
 */
export function TimeInput({
  value,
  onValueChange,
  ref,
  ...props
}: TimeInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== value) input.value = value;
  }, [value]);

  return (
    <Input
      {...props}
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      type="time"
      defaultValue={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
