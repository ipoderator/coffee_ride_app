/**
 * CR-118: the empty sheet's one illustration — a few concentric contour lines,
 * drawn in `currentColor` (`EmptyState` sets it to `text-muted` and marks it
 * `aria-hidden`). Decorative only; the empty state's title carries the meaning.
 */
export function ContoursIllustration() {
  return (
    <svg
      width="72"
      height="56"
      viewBox="0 0 72 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M36 25c4-1 7 1 6 4s-6 4-9 2-1-5 3-6z" />
      <path d="M35 17c9-2 17 3 16 11s-10 11-18 9-10-7-8-12 4-7 10-8z" />
      <path d="M33 9c14-3 27 5 27 18s-13 21-27 19S10 36 12 26 21 11 33 9z" />
      <path d="M31 2c19-3 38 7 38 25S51 56 32 54 2 42 3 27 14 5 31 2z" />
    </svg>
  );
}
