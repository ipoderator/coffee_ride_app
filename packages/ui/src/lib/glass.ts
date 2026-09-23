// Retired by ADR-021 («Топокарта» bans glass/blur); kept as a name because
// its CR-107 consumers still import it — `RideCard`'s and `RideDetailView`'s
// cover-photo panel (`FEATURE_COVER_GLASS_PANEL`) and the sticky mobile
// registration bar (`FEATURE_STICKY_REGISTRATION_CTA`), both flag-gated and
// off by default. `--glass-bg`/`--glass-border` now resolve to the opaque
// `surface`/`border` tokens (`tokens.css`) and the `backdrop-blur` is gone, so
// a flag switched on draws a flat printed panel. The discovery/ride-detail
// rebuilds (CR-118/CR-119) are expected to drop these call sites; remove this
// constant and the two tokens once nothing references them.
//
// Pure Tailwind utility composition, deliberately not a custom CSS class:
// `bg-glass-bg`/`border-glass-border` are real Tailwind utilities (from
// `tokens.css`'s `@theme inline` mapping), so they correctly lose to a
// caller's own `md:bg-transparent`-style responsive reset on the same
// element — an unlayered custom class would always win that fight
// regardless of breakpoint, since Tailwind v4's own utilities live inside
// `@layer utilities` and any unlayered CSS unconditionally outranks every
// layer.
export const GLASS_PANEL_CLASSNAME = 'bg-glass-bg border border-glass-border';
