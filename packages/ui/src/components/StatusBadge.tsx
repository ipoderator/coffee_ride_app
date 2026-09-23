import { cn } from '../lib/cn';
import type { StatusTone } from '../terminology';

// docs/design.md §1's "one exception" names `danger` as the only tone allowed as a
// *filled* (solid-background) badge — cancellation is the one thing a participant must
// not scroll past. Every other tone stays a low-weight tinted chip instead of a solid
// fill, matching the calm/low-saturation direction (§1: "no vivid saturated accents").
// This also lines up with `tokens.css` (CR-063): it defines a contrasting foreground
// only for `--on-primary` and `--on-danger` — the two tones actually meant to carry a
// solid fill with white/near-black text — and none for success/warning/info/neutral,
// which is the concrete signal those were never meant to be rendered as one.
//
// This is deliberately self-contained rather than composed from a separate generic
// `Badge` primitive (`docs/design.md` §9 lists both `Badge` and `StatusBadge` in
// `packages/ui`'s inventory, as two different components) — `Badge` is a shadcn-CLI
// primitive, out of CR-065's scope, and building it here would silently pull in KI-020
// (shadcn's vendoring-target question) before it's actually necessary.
const TONE_STYLES: Record<StatusTone, string> = {
  neutral: 'border border-border bg-bg-raised text-text-secondary',
  success: 'border border-success/30 bg-success/10 text-success',
  warning: 'border border-warning/30 bg-warning/10 text-warning',
  info: 'border border-info/30 bg-info/10 text-info',
  danger: 'border border-transparent bg-danger text-on-danger',
};

export interface StatusBadgeProps {
  /** e.g. `RIDE_STATUS_TERMS[ride.status].label`. Never rendered without this text —
   * `docs/design.md` §12/§1: color never carries meaning alone. */
  label: string;
  tone: StatusTone;
  className?: string;
}

export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        // 4px "printed stamp" chip, not a pill (docs/design.md §5, ADR-021)
        'inline-flex items-center rounded-md px-3 py-1 text-sm leading-none font-medium',
        TONE_STYLES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
