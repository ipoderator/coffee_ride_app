import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// `docs/design.md` §5: resting surfaces get a hairline border, never a shadow
// (that's reserved for overlays — `--shadow-overlay`, not used here).
export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg-raised p-6',
        className,
      )}
      {...props}
    />
  );
}
