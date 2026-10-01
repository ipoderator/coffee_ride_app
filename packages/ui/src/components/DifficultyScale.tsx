'use client';

import { useRef } from 'react';
import { cn } from '../lib/cn';
import { useInViewOnce } from '../lib/use-in-view-once';
import { DIFFICULTY_LEVEL_TERMS, type DifficultyLevel } from '../terminology';

const LEVELS: readonly DifficultyLevel[] = [1, 2, 3, 4, 5];

// docs/design.md §6: "A discrete 1-5 scale rendered as filled/empty segments plus a
// word ... Not a color gradient, not color-only." The segments below are therefore a
// single tone (`frame`, the ink — ADR-021 keeps the plum overprint for the route
// and the primary action only) at two states — filled ink / hollow `border-input`
// outline (CR-128: the old `border`-filled empty segment was ~1.5:1 against the
// paper and all but disappeared in the light theme) — not a
// per-level color ramp, and are `aria-hidden` — purely decorative, since the word and
// the `sr-only` qualifier below already carry the full meaning for a screen reader
// (§12: never color alone, and here not "segments alone" either).
export interface DifficultyScaleProps {
  level: DifficultyLevel;
  /** `sm` (CR-144): narrow segments and small text, for a chip on a ride card. */
  size?: 'md' | 'sm';
  /** CR-170: filled segments fill in left to right once, when the scale
   * first scrolls into view (`segment-fill`, `motion-safe:` only). Off by default — a grid of cards
   * filling at once is noise; the ride page opts in. */
  animated?: boolean;
  className?: string;
}

// Gap between one segment starting to fill and the next.
const SEGMENT_STAGGER_MS = 70;

export function DifficultyScale({
  level,
  size = 'md',
  animated = false,
  className,
}: DifficultyScaleProps) {
  const label = DIFFICULTY_LEVEL_TERMS[level];
  const small = size === 'sm';
  const segmentsRef = useRef<HTMLDivElement>(null);
  const inView = useInViewOnce(segmentsRef, { enabled: animated });
  return (
    <div
      className={cn(
        'inline-flex items-center',
        small ? 'gap-1.5' : 'gap-2',
        className,
      )}
    >
      <div
        ref={segmentsRef}
        className={small ? 'flex gap-0.5' : 'flex gap-1'}
        aria-hidden="true"
      >
        {LEVELS.map((segment) => {
          const filled = segment <= level;
          const fills = animated && filled;
          return (
            <span
              key={segment}
              data-filled={filled || undefined}
              className={cn(
                small
                  ? 'h-2.5 w-1 rounded-[1px] border'
                  : 'h-2 w-4 rounded-sm border',
                filled
                  ? 'border-frame bg-frame'
                  : 'border-border-input bg-transparent',
                fills && 'motion-safe:animate-segment-fill',
                // Held at the hollow first frame until it is on screen.
                fills && !inView && '[animation-play-state:paused]',
              )}
              style={
                fills
                  ? {
                      animationDelay: `${(segment - 1) * SEGMENT_STAGGER_MS}ms`,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      <span
        className={
          small
            ? 'text-xs text-text-secondary'
            : 'text-body-sm font-medium text-text'
        }
      >
        {label}
        {/* Visible text says the word; this adds the position a sighted reader gets
            from the segments, without repeating the word itself. */}
        <span className="sr-only">{` (уровень ${level} из 5)`}</span>
      </span>
    </div>
  );
}
