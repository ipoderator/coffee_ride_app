import { cn } from '../lib/cn';

// CR-097 (KI-023 remainder): the `Avatar` component design.md §9's component
// inventory has named since CR-063 but never built — the first real consumers are
// the participant/organizer profile screens' avatar upload UI. Framework-neutral
// (plain `<img>`, no `next/image`) like every other `packages/ui` component —
// `apps/web` resolves `src` through `apiAssetUrl` before passing it in, same as
// `CoverImageUploadForm` already does for its own `<Image>`.
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_STYLES: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-20 w-20 text-xl',
  xl: 'h-32 w-32 text-3xl',
};

export interface AvatarProps {
  /** Resolved image URL, or `null`/`undefined` for the initials/icon fallback. */
  src?: string | null;
  /** Used both for the fallback initials and the image's `alt` text. */
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}

function initialsFrom(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]!.toUpperCase()).join('');
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = initialsFrom(name);

  if (src) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary',
          SIZE_STYLES[size],
          className,
        )}
      >
        {/* Plain `<img>`, not `next/image` — `packages/ui` has no Next.js
            dependency; `apps/web` callers resolve `src` through `apiAssetUrl`
            the way `CoverImageUploadForm` does for its own `next/image`. */}
        <img
          src={src}
          alt={name ?? ''}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={name ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-medium text-on-primary',
        SIZE_STYLES[size],
        className,
      )}
    >
      {initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        // Generic silhouette — no name and no image at all.
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-2/3 w-2/3"
        >
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
      )}
    </span>
  );
}
