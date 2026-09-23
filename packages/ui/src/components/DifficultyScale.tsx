import { cn } from '../lib/cn';
import { DIFFICULTY_LEVEL_TERMS, type DifficultyLevel } from '../terminology';

const LEVELS: readonly DifficultyLevel[] = [1, 2, 3, 4, 5];

// docs/design.md §6: "A discrete 1-5 scale rendered as filled/empty segments plus a
// word ... Not a color gradient, not color-only." The segments below are therefore a
// single tone (`frame`, the ink — ADR-021 keeps the plum overprint for the route
// and the primary action only) at two states (filled/empty via `border`), not a
// per-level color ramp, and are `aria-hidden` — purely decorative, since the word and
// the `sr-only` qualifier below already carry the full meaning for a screen reader
// (§12: never color alone, and here not "segments alone" either).
export interface DifficultyScaleProps {
  level: DifficultyLevel;
  className?: string;
}

export function DifficultyScale({ level, className }: DifficultyScaleProps) {
  const label = DIFFICULTY_LEVEL_TERMS[level];
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {LEVELS.map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-2 w-4 rounded-sm',
              segment <= level ? 'bg-frame' : 'bg-border',
            )}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-text">
        {label}
        {/* Visible text says the word; this adds the position a sighted reader gets
            from the segments, without repeating the word itself. */}
        <span className="sr-only">{` (уровень ${level} из 5)`}</span>
      </span>
    </div>
  );
}
