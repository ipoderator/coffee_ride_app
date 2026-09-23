import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

// A native `<input type="file">`, styled so its picker button actually looks
// like a button. Tailwind's preflight strips `::file-selector-button` down to
// bare text, which left every upload form showing "Выберите файл Файл не
// выбран" as a plain line nobody recognized as clickable. Styling the native
// control (rather than hiding it behind a custom button) keeps its label
// association, keyboard behavior and `files` API untouched for callers.
export interface FileInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  ref?: Ref<HTMLInputElement>;
}

export function FileInput({ className, ref, ...props }: FileInputProps) {
  return (
    <input
      ref={ref}
      type="file"
      className={cn(
        'block w-full max-w-full cursor-pointer text-sm text-text-secondary',
        'file:mr-3 file:inline-flex file:min-h-11 file:cursor-pointer file:items-center file:rounded-lg file:border file:border-border-input file:bg-bg file:px-4 file:text-sm file:font-medium file:text-text',
        'hover:file:bg-bg-raised',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:file:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}
