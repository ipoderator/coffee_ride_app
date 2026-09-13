import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Same standard class-name helper apps/web's own `src/lib/utils.ts` carries (CR-002):
// merges conditional classes (clsx) and resolves conflicting Tailwind utility classes
// (tailwind-merge). Duplicated here rather than imported from apps/web, deliberately —
// `packages/ui` cannot depend on `apps/web` (`.claude/rules/architecture.md`'s
// dependency direction is web -> ui, never the reverse), and every component in this
// package needs it (CR-065's first consumers).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
