// "Quiet Instrument" glass surface (CR-107, docs/design.md §3) — reserved
// for exactly two surfaces (cover-photo title/status panel, sticky mobile
// registration bar), never a general card treatment. A shared constant
// rather than each call site repeating the class list, so the two/three
// consumers can't silently drift.
//
// Pure Tailwind utility composition, deliberately not a custom CSS class:
// `bg-glass-bg`/`border-glass-border` are real Tailwind utilities (from
// `tokens.css`'s `@theme inline` mapping), so they correctly lose to a
// caller's own `md:bg-transparent`-style responsive reset on the same
// element — an unlayered custom class would always win that fight
// regardless of breakpoint, since Tailwind v4's own utilities live inside
// `@layer utilities` and any unlayered CSS unconditionally outranks every
// layer. `backdrop-blur-lg` degrades to no blur (still `bg-glass-bg`'s
// translucent fill, still AA-safe under `--scrim`) wherever
// `backdrop-filter` is unsupported — the browser simply ignores the
// property — or the viewer prefers reduced motion/transparency.
export const GLASS_PANEL_CLASSNAME =
  'bg-glass-bg border border-glass-border backdrop-blur-lg motion-reduce:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';
