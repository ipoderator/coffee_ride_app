import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The role type scale's `text-*` names (CR-152, `tokens.css`). tailwind-merge
 * only knows Tailwind's default sizes, so without this it would read
 * `text-h1` as a colour and drop it next to `text-text` (or the reverse).
 */
export const TEXT_ROLES = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'body-sm',
  'label',
  'metric',
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TEXT_ROLES] }] } },
});

// Same standard class-name helper apps/web's own `src/lib/utils.ts` re-exports (CR-002):
// merges conditional classes (clsx) and resolves conflicting Tailwind utility classes
// (tailwind-merge). Lives here rather than in apps/web — `packages/ui` cannot depend on
// `apps/web` (`.claude/rules/architecture.md`'s dependency direction is web -> ui,
// never the reverse), and every component in this package needs it.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
