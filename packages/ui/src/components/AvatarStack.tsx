import { cn } from '../lib/cn';
import { Avatar, type AvatarProps } from './Avatar';

// ADR-024 («Ночной старт»): "who's going" on the route cover and ride
// list/detail — overlapping `Avatar`s plus a `+N` overflow chip, built on top
// of the existing `Avatar` primitive rather than duplicating its
// image/initials/fallback logic.
export interface AvatarStackPerson {
  src?: string | null;
  name?: string | null;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  /** Total count, if it may exceed `people.length` (e.g. a preview list
   * shorter than the real participant count) — defaults to `people.length`. */
  total?: number;
  /** How many avatars to show before collapsing the rest into `+N`. */
  max?: number;
  size?: Extract<AvatarProps['size'], 'sm' | 'md'>;
  className?: string;
}

export function AvatarStack({
  people,
  total,
  max = 4,
  size = 'sm',
  className,
}: AvatarStackProps) {
  const shown = people.slice(0, max);
  const overflow = Math.max((total ?? people.length) - shown.length, 0);

  return (
    <div
      role="group"
      aria-label={`Участники: ${total ?? people.length}`}
      className={cn('flex items-center', className)}
    >
      {shown.map((person, index) => (
        <Avatar
          key={index}
          src={person.src}
          name={person.name}
          size={size}
          className="-ml-2 ring-2 ring-bg-raised first:ml-0"
        />
      ))}
      {overflow > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            '-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-primary-tint font-mono font-semibold text-primary ring-2 ring-bg-raised',
            size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-12 w-12 text-xs',
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
