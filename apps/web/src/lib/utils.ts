import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui's standard class-name helper: merges conditional classes (clsx)
// and resolves conflicting Tailwind utility classes (tailwind-merge).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
