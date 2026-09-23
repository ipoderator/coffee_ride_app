import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from 'ui';

/**
 * CR-109: the labeled way back out of a nested screen. Before this, every
 * sub-screen (`/rides/[id]`, everything under `/organizer/rides/[id]/`, each
 * cabinet sub-page) left the browser's own Back button as the only route to
 * its parent.
 *
 * Takes an explicit `href` rather than calling `router.back()`. History is not
 * a reliable parent: a participant who opened a ride from a shared link has no
 * previous page in this app at all, and `back()` would drop them out of it
 * entirely. Naming the destination also lets the label say where it goes,
 * which a bare "Назад" cannot.
 *
 * Lives in `apps/web` rather than `packages/ui`: it depends on `next/link`,
 * and `packages/ui` stays router-agnostic (see `NAV_MENU_ITEM_CLASSNAME`'s
 * own note).
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // `-ml-2` pulls the icon back to the container's optical left edge:
        // the padding is there for the 44px touch target (`docs/design.md`
        // §5), not to indent the link away from the content it sits above.
        'inline-flex min-h-11 items-center gap-1.5 self-start rounded-md px-2 -ml-2 text-sm font-medium text-text-secondary transition-colors hover:text-text',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
