/**
 * `prefers-reduced-motion` for motion driven from JS (a smooth scroll, a map
 * camera move) — CSS animations use Tailwind's `motion-safe:` instead
 * (`docs/design.md` §12). `false` on the server and wherever `matchMedia` is
 * missing (jsdom), i.e. "animate" is the default.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
