import { cn } from '../lib/cn';
import { WORDMARK_TERMS } from '../terminology';

// CR-121, replacing ADR-021's «coffee◦ride»: an elevation-profile mark in the
// overprint colour (`primary`), then lowercase «кофе•райд» in Golos 800 in
// ink (`text`), the dot a filled `primary` disc. Both SVGs are sized in `em`
// so the whole logo scales with whatever text size the caller sets; an inline
// SVG's bottom edge sits on the text baseline (`align-baseline`).
//
// The visible glyphs are `aria-hidden`; assistive tech reads the product's
// name from the visually hidden span. `app/icon.svg` is the profile alone.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-sans text-[1.8rem] leading-none font-extrabold tracking-[-0.02em] text-text',
        className,
      )}
    >
      <span className="sr-only">{WORDMARK_TERMS.name}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {/* The profile: 2:1, bottom on the baseline, as tall as the ф. */}
        <svg
          viewBox="0 0 40 20"
          className="mr-[0.16em] inline-block h-[0.8em] w-[1.6em] shrink-0 self-baseline align-baseline"
          focusable="false"
        >
          <path
            d="M0.4 20C0.4 17 2.6 14.2 5.8 14.1C8 14 9 14.8 10.6 14.4C13.4 13.7 15.6 7.8 20.6 7.6C23 7.5 24.2 8.8 25.8 8C28.8 6.5 31.4 0 35.8 0C38.2 0 40 1.8 40 4.2V19.2C40 19.6 39.6 20 39.2 20Z"
            className="fill-primary"
          />
        </svg>
        кофе
        {/* The dot: 0.24em disc, lifted so its centre sits mid x-height. */}
        <svg
          viewBox="0 0 10 10"
          className="mx-[0.07em] inline-block h-[0.24em] w-[0.24em] shrink-0 translate-y-[-0.15em] self-baseline align-baseline"
          focusable="false"
        >
          <circle cx="5" cy="5" r="5" className="fill-primary" />
        </svg>
        райд
      </span>
    </span>
  );
}
