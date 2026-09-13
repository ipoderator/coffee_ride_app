import { cn } from '../lib/cn';

// docs/design.md §10, point 1: "skeletons matching the final layout, not a centered
// spinner. No layout shift when data lands." This component is deliberately just a
// shaped, colored block — it carries no opinion about size/shape itself (that's the
// consumer's job: render one `Skeleton` per real element, sized to match, e.g. a
// `h-4 w-32` skeleton in place of a title that will be that size once loaded).
//
// This is a real shadcn-registry primitive (unlike any of CR-065's four components —
// see KI-020 in `.claude/context/known-issues.md`), hand-vendored here rather than run
// through the shadcn CLI: `packages/ui` isn't a CLI-detectable Next/Vite app target,
// and the upstream component is one `div` with two classes, re-themed to our own
// tokens instead of shadcn's default `bg-muted` (`packages/ui` has no `muted` token —
// `text-muted` at low opacity is the closest existing subtle-surface tone).
//
// `aria-hidden`: purely decorative filler, same reasoning as `DifficultyScale`'s
// segments — the real accessible signal for a loading region is the caller's own
// `aria-busy`/live-region handling around the whole skeleton layout, not this element.
// `motion-safe:animate-pulse` (not a bare `animate-pulse`): docs/design.md §12 requires
// respecting `prefers-reduced-motion` for all non-essential animation — the pulse is
// exactly that (non-essential; the block is still visible and legible without it).
export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'motion-safe:animate-pulse rounded-md bg-text-muted/15',
        className,
      )}
    />
  );
}
