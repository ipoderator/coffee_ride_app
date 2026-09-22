import { cn } from '../lib/cn';

// CR-107 ("Quiet Instrument"): resolves docs/design.md §15's placeholder
// ("a text wordmark in the base typeface is the MVP placeholder") with
// direction A from the critique — Golos Text (no new typeface/dependency,
// already Cyrillic-verified as this app's own body face), lowercase,
// "coffee" at weight 500 + ".ride" at weight 400, in `--primary`. The
// visible text stays a single accessible string for screen readers/copy-
// paste; only the two segments' `<span>`s differ in weight.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg text-primary', className)}>
      <span className="font-medium">coffee</span>
      <span className="font-normal">.ride</span>
    </span>
  );
}
