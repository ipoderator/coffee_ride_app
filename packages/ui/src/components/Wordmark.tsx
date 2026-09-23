import { cn } from '../lib/cn';

// ADR-021 («Топокарта»), replacing CR-107's Golos "coffee.ride": lowercase
// Sofia Sans Condensed 700 in ink (`text`), with the dot replaced by a ring
// in the overprint colour (`primary`) — the orienteering control-point
// circle. The ring is sized in `em` so it scales with whatever text size the
// caller sets: diameter ≈ the face's x-height (0.5em), stroke ≈ 0.14em, and
// an inline SVG's bottom edge sits on the text baseline (`align-baseline`).
//
// The visible glyphs are `aria-hidden`; assistive tech reads the product's
// name, «Coffee Ride», from the visually hidden span instead of the
// lowercase, ring-split spelling. `app/icon.svg` is the same ring alone.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-display text-2xl leading-none font-bold text-text',
        className,
      )}
    >
      <span className="sr-only">Coffee Ride</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        coffee
        {/* viewBox units: 10 = the ring's 0.5em box, so the 0.14em stroke is
            2.8 units and the radius leaves the stroke fully inside the box. */}
        <svg
          viewBox="0 0 10 10"
          className="mx-[0.05em] inline-block h-[0.5em] w-[0.5em] shrink-0 self-baseline align-baseline"
          focusable="false"
        >
          <circle
            cx="5"
            cy="5"
            r="3.6"
            fill="none"
            strokeWidth="2.8"
            className="stroke-primary"
          />
        </svg>
        ride
      </span>
    </span>
  );
}
