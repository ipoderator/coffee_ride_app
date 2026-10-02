# UX / UI Design Specification

Scope: the visual and interaction layer of Coffee Ride. This file is the source of truth
for palette, typography, metric presentation, screen inventory, required UI states, and
Russian UI terminology.

Related: `.claude/rules/frontend.md` (component/form/a11y rules), `docs/product.md`
(domain fields and lifecycle), `.claude/rules/extensibility.md` (ADR-009 — cabinet
feature modules), `.claude/rules/resilience.md` (degraded states).

Implementation tasks: CR-063…CR-066 in `docs/tasks.md`.

---

## 1. Visual direction

**«Ночной старт»** (ADR-024, 2026-09-24; replaces «Топокарта», ADR-021). The interface is
for people who leave before dawn: a dark, low-glare surface by default, a route-drawn
cover on every ride instead of a flat placeholder, and larger tabular numerals read at a
glance in low light. Dark is the default theme now, not a preference the viewer has to
find (§3).

Rules:

- **Panels are genuinely raised, not paper.** `bg` is the page; `bg-raised` (panels,
  header, tab bar) and `surface` (metric cells, the selected nav item) are distinct,
  deeper tones — unlike ADR-021's "no card fill" rule.
- **Three colour roles, not one overprint ink.** `primary` (AA text: links, focus ring,
  the active tab) is a shade darker/lighter than the locked brand hex so body text still
  clears AA; `brand` is the actual locked hex (`#82668C` light / `#B8A0C1` dark) for the
  logo, the route track and graphic elements only; `primary-fill` is the button fill
  (`#82668C` in both themes, white text). None of the three is decoration on cards,
  badges or backgrounds beyond their stated role.
- **The other inks carry meaning only**, unchanged in role from ADR-021: `elevation`
  (renamed from `contour`) = elevation profile/gain, blue `info` = information, green
  `success` = confirmed/published, yellow `warning-fill`/`warning` = caution (waitlist,
  closing registration, degraded service). They are never used for ornament.
- **Shape is pills and large radii**, not a 4px stamp (§5): buttons/chips are fully
  rounded, panels/cards/the route cover use large radii, metric cells/inputs use a
  medium radius.
- **Every ride gets a drawn cover, not a placeholder.** `RouteCover` (`apps/web`) draws a
  dark "window" — deliberately unaffected by the light/dark UI theme, like a photo —
  from decorative isoline art plus the ride's own route track, on every grid card,
  whether or not the organizer uploaded a photo. Since CR-144 the cover carries only the
  track and the status chip — no text over the art (§6 "Ride grid card").
- **Color never carries meaning alone** (`.claude/rules/frontend.md`): status, difficulty
  and errors always carry a text label and/or icon as well.
- **Banned:** gradients, glow/neon, glass/blur/translucent panels, khaki/cream/"vintage
  paper" tints, serif display faces. Photography (ride cover images) and `RouteCover`'s
  drawn art provide the interface's only other colour; the chrome itself stays to the
  token palette.

### The one exception: destructive semantics

The printed direction governs the interface's ordinary surfaces. Destructive and failed
states are the deliberate exception, settled by the product owner on 2026-09-10 after
reviewing a muted-brick first draft and kept unchanged by ADR-021: **cancellation uses a
genuinely bright red.** A cancelled ride is the one thing a participant must not scroll
past, and a whisper-quiet cancellation badge is a missed-ride support ticket waiting to
happen. ADR-024 leaves this exception exactly as written.

- `danger` is a saturated red — `#B92A1E` light / `#FF5A4F` dark, both AA against
  their actual ground, `--bg` (5.48:1 on `#F3F1F5`, 6.05:1 on `#111315`) and against
  the `danger/10` tint `ErrorState`'s retry button sits on (4.69:1) — KI-080:
  `#D42B20` cleared AA only on a plain white ground, not the real `--bg`/tint;
- it is used for cancellation, destructive actions **and validation errors**;
- it may be used as text, icon, border **or a filled badge** — a filled "Отменён" badge is
  the intended treatment, not a violation of the direction. An in-page destructive
  button is a danger **outline** (danger border + danger text); the solid red fill is
  reserved for the confirming button inside `ConfirmDialog` (ADR-021);
- it still never appears without an accompanying word ("Отменён", "Ошибка") or icon —
  color alone is never the signal (§12);
- it stays reserved for destructive and failed states. Red is the loudest thing in this
  interface precisely because nothing else is allowed to use it.

---

## 2. Reference products

> Since ADR-021 the visual direction is «Топокарта» (§1), not the calm/muted one this
> table was first written against. The table still stands for **information design**
> (metric rows, route-first layout, legible numbers); read its "what to avoid" column
> as "vivid decorative accents", which the new direction bans just the same.

Take **information design** from endurance-sport tools, not their branding. All five have
solved "show a route and its numbers to an athlete on a phone."

| Product       | What to borrow                                                                                                       | What to avoid                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Strava        | Metric row under the map (distance / elevation / time); activity-card hierarchy; elevation profile tied to the route | The signature bright orange (`#FC4C02`) — exactly the kind of vivid accent this project rejects |
| TrainingPeaks | Dense but readable metric tables; clear label→value→unit typographic hierarchy; muted chart fills                    | Coach-grade information density; MVP shows a handful of numbers, not a full analytics workspace |
| FinalSurge    | Calm, restrained neutral chrome; list/calendar layouts for upcoming events                                           | Dated form styling                                                                              |
| Zwift         | Legibility of large numbers at a glance and from a distance                                                          | Neon/gamified visual language entirely                                                          |
| Rouvy         | Route-first layout: profile + key numbers + difficulty as a discrete scale                                           | Photo-heavy immersive treatment                                                                 |

Common pattern worth stating explicitly: in all of them the **route and its numbers are
the page**, and the interface chrome disappears. Coffee Ride should read the same way.

---

## 3. Color tokens

Semantic names only. Feature code never hard-codes a hex value — it uses these tokens
via the Tailwind theme (`bg-surface`, `text-text-secondary`, `border-frame`, ...). Map
SDK colours (route line, markers) are read from the same custom properties at call time
(`getCssColorVar`, §14).

Token names from CR-063 are kept where ADR-024 didn't call for a new role
(`.claude/rules/extensibility.md`); `brand`, `primary-fill`, `primary-fill-hover` and
`on-primary-fill` are new (ADR-024 §1 — a single overprint ink stopped clearing AA text
contrast at the new hue); `contour` is renamed `elevation` (name only, same role). Every
other additive CR-063/ADR-021 token (`surface`, `frame`, `primary-hover`, `primary-tint`,
`route`, `route-casing`, `warning-fill`, `on-warning-fill`, `info-tint`) keeps its name.
Contrast ratios below were computed (WCAG 2.1 relative luminance) against the theme's
`bg`, with the value against `surface` in brackets where it matters; they meet AA (4.5:1
for text, 3:1 for UI component boundaries and graphics).

**Page vs panel.** `bg` is the page. `bg-raised` (panels, header, tab bar) and `surface`
(metric cells, the selected nav item) are genuinely different, deeper tones — unlike
ADR-021's "no card fill" rule, where `bg-raised` equalled `bg`.

### Light theme

| Token                | Hex       | Contrast              | Use                                                            |
| -------------------- | --------- | --------------------- | -------------------------------------------------------------- |
| `bg`                 | `#F3F1F5` | —                     | Page background                                                |
| `bg-raised`          | `#FFFFFF` | —                     | Panels, header, tab bar                                        |
| `surface`            | `#F8F6F9` | —                     | Metric cells, selected nav item                                |
| `text`               | `#17141A` | 17.4:1                | Primary text — the ink                                         |
| `text-secondary`     | `#413C47` | ~11:1                 | Labels, captions, metric labels                                |
| `text-muted`         | `#5A5460` | ~7:1                  | Least-important text; still AA                                 |
| `frame`              | `#17141A` | 17.4:1                | Ink rule: map frame, secondary-button outline, strong dividers |
| `border`             | `#DDD7E1` | decorative            | Hairlines between rows, card outlines                          |
| `border-input`       | `#A89CB0` | ~3.3:1                | Form control boundaries (AA for UI components)                 |
| `primary`            | `#74597E` | 6.1:1                 | AA text role: links, focus ring, active tab                    |
| `primary-hover`      | `#5F4869` | higher                | Primary text/link hover                                        |
| `on-primary`         | `#FFFFFF` | on `primary`          | Text on a small `primary`-filled chip                          |
| `primary-tint`       | `#EDE6F0` | `primary` on it, AA   | Selected state behind primary-role content (sparingly)         |
| `brand`              | `#82668C` | ≥3:1 (graphics)       | Logo, route track, graphic elements only — not AA text         |
| `primary-fill`       | `#82668C` | white on it ~5:1      | Primary button fill                                            |
| `primary-fill-hover` | `#6C5376` | higher                | Primary button fill hover                                      |
| `on-primary-fill`    | `#FFFFFF` | 5:1 on `primary-fill` | Text on the primary button fill                                |
| `route`              | `#82668C` | graphics              | The ride's route line on a map (6px) — same value as `brand`   |
| `route-casing`       | `#FFFFFF` | —                     | Casing under the route line                                    |
| `elevation`          | `#94650F` | ~5.5:1                | Elevation: profile chart, gain (renamed from `contour`)        |
| `success`            | `#1D6F38` | ~6:1                  | Registration confirmed, published                              |
| `warning`            | `#7A5300` | ~6.5:1                | Warning **text**: waitlist, closing registration, degraded     |
| `warning-fill`       | `#FFC94D` | —                     | Warning fill (badge/notice background)                         |
| `on-warning-fill`    | `#17141A` | on `warning-fill`     | Ink text on the warning fill                                   |
| `info`               | `#0B65A6` | ~6:1                  | Neutral informational notes, ride updates                      |
| `info-tint`          | `#E3F0FA` | `info` on it          | Info notice background                                         |
| `danger`             | `#B92A1E` | 5.48:1                | Cancellation, destructive action, validation error (KI-080)    |
| `on-danger`          | `#FFFFFF` | on `danger`           | Text on a filled danger badge/button                           |

### Dark theme (the default — §1)

| Token                | Hex       | Contrast            | Use                                         |
| -------------------- | --------- | ------------------- | ------------------------------------------- |
| `bg`                 | `#121015` | —                   | Page background                             |
| `bg-raised`          | `#1C1920` | —                   | Panels, header, tab bar                     |
| `surface`            | `#25212A` | —                   | Metric cells, selected nav item             |
| `text`               | `#F3F0F5` | ~15:1               | Primary text                                |
| `text-secondary`     | `#C7C0CC` | ~10:1               | Labels, captions                            |
| `text-muted`         | `#A39CA9` | ~6.5:1              | Least-important text                        |
| `frame`              | `#F3F0F5` | ~15:1               | Ink rule                                    |
| `border`             | `#2E2934` | decorative          | Hairlines                                   |
| `border-input`       | `#4A4450` | ~3.3:1              | Form control boundaries                     |
| `primary`            | `#B8A0C1` | ~7:1                | AA text role: links, focus ring, active tab |
| `primary-hover`      | `#C7B3CF` | higher              | Primary text/link hover                     |
| `on-primary`         | `#1C0F1E` | on `primary`        | Text on a small `primary`-filled chip       |
| `primary-tint`       | `#2E2535` | `primary` on it, AA | Selected state (sparingly)                  |
| `brand`              | `#B8A0C1` | ≥3:1 (graphics)     | Logo, route track, graphic elements         |
| `primary-fill`       | `#82668C` | white on it ~5:1    | Primary button fill (same hex both themes)  |
| `primary-fill-hover` | `#93779D` | higher              | Primary button fill hover                   |
| `on-primary-fill`    | `#FFFFFF` | on `primary-fill`   | Text on the primary button fill             |
| `route`              | `#B8A0C1` | graphics            | Route line — same value as `brand`          |
| `route-casing`       | `#121015` | —                   | Casing under the route line                 |
| `elevation`          | `#D9A441` | ~7:1                | Elevation (renamed from `contour`)          |
| `success`            | `#62C483` | ~8:1                | —                                           |
| `warning`            | `#F0C04E` | ~10:1               | Warning text                                |
| `warning-fill`       | `#F0C04E` | —                   | Warning fill                                |
| `on-warning-fill`    | `#121015` | on `warning-fill`   | Text on the warning fill                    |
| `info`               | `#6DB4EE` | ~8:1                | —                                           |
| `info-tint`          | `#15293A` | `info` on it        | Info notice background                      |
| `danger`             | `#FF5A4F` | 6.05:1              | Unchanged                                   |
| `on-danger`          | `#171614` | on `danger`         | Text on a filled danger badge               |

`RouteCover`'s window (§1, new — `cover-bg` `#16131A`, `cover-line` `#2C2732`,
`cover-ink` `#FFFFFF`, `cover-route` `#B8A0C1`, `cover-elevation` `#82668C`) is
deliberately the same in both themes, like a photo — it has no `.dark` override, same
pattern as the `map-*` tokens (§14).

Dark theme is now the **default** (ADR-024 §4), not just present: an empty
`localStorage` resolves to dark. It is part of CR-063/ADR-021's original "not optional or
later" commitment, taken one step further.

Since CR-110 the viewer can also choose explicitly — системная / светлая / тёмная, from
the global header. Three states, not a two-way switch, so picking one does not
permanently discard the "follow the OS" option. The choice is stored per browser
(`localStorage`, key `coffee-ride-theme` — ADR-024: `'system'` is now stored as a literal
value rather than clearing the key, so an explicit "Система" choice stays distinguishable
from never having chosen at all) and applied by a pre-hydration script in
`app/layout.tsx`, so there is no flash of the wrong theme on first paint; every storage
access is guarded, since it throws outright in a private window with site data blocked.

### Retired: glass tokens (CR-107 → ADR-021)

`glass-bg`/`glass-border` and `packages/ui`'s `GLASS_PANEL_CLASSNAME` belonged to the
"Quiet Instrument" direction, which ADR-021 replaced; «Топокарта» bans glass and blur.
Deleted by CR-119, together with both flags that gated their consumers
(`FEATURE_COVER_GLASS_PANEL`, `FEATURE_STICKY_REGISTRATION_CTA`), once the discovery
and ride-detail rebuilds dropped the last call sites. The sticky mobile registration bar
on `/rides/[id]` stays — it is the default now, a `surface` sheet with an ink rule.

`scrim` (`rgb(23 20 26 / 55%)`, ink at 55%, same in both themes) stays: it is a wash
under text placed on a user-uploaded photo, needed for contrast whatever the photo is —
a legibility device, not glass.

### Data visualization colors

Charts use the map's own inks, never a categorical rainbow. The **elevation profile is
`elevation` ink** (40%→12% gradient fill + 2px stroke, CR-128; renamed from `contour`,
ADR-024). `chart-secondary` survives as a name (also the `food` route-point marker) and
aliases `elevation`. Difficulty and status are encoded by **label + position on a
scale**, not by hue. The route line itself is `route` over `route-casing`, 6px.

---

## 4. Typography

- **Body/UI: Golos Text** (Paratype) — a grotesque drawn for Russian text, with Cyrillic
  as a first-class script — over the system stack (`-apple-system, "Segoe UI", Roboto,
sans-serif`). Utility class `font-sans` (the default).
- **Labels/eyebrows: IBM Plex Mono** (CR-152, ADR-026) — small uppercase labels
  (`MetricTile`'s `<dt>`, section eyebrows, dates on cards): `font-mono text-label
uppercase`. Sofia Sans Condensed held this role until ADR-026 retired it; the mono
  face reads better at 12–13px and was already the data face, so one face now covers
  both.
- **Titles: Unbounded** (ADR-024, narrowed by ADR-026) — only the display role (a
  ride's title on its own page) and `h1` (every page's title). Utility class
  `font-title`, token `--font-title`; `h1` gets it by default (`globals.css`).
  `h2`/`h3`/card titles are **Golos 600** — Unbounded is wide enough that a long
  Russian title breaks into 3–4 lines at card/section sizes.
- **Metric numerals: Sofia Sans Extra Condensed** (ADR-024) — the large tabular
  numerals in `MetricTile` and the route cover. Utility class `font-num`, token
  `--font-num`. Weights 700/800.
- **Self-hosted, never fetched at build time** (CR-146, KI-074): every face above is
  a committed `.woff2` in `apps/web/src/fonts/` loaded through `next/font/local`
  (`app/layout.tsx`), SIL OFL, licences in `src/fonts/licenses/`. The files are
  generated by `src/fonts/build-fonts.sh` from pinned google/fonts sources — Google's
  own `latin` + `cyrillic` glyph ranges and every OpenType feature kept. Adding a
  weight means re-running that script with the new weight and committing its output.
- **Russian letterforms depend on `lang="ru"`.** Sofia Sans' default Cyrillic is drawn in
  the Bulgarian style (в/д/и/т look like b/g/u/m); the Russian forms come from its
  `locl` OpenType feature, which browsers apply only when the text's language is Russian.
  `<html lang="ru">` in `app/layout.tsx` guarantees that — never remove it and never set
  another `lang` on an element rendered in `font-num` (Sofia Sans Extra Condensed;
  verified in the browser for CR-115).
- **IBM Plex Mono** is also the utility face for hex values, IDs, units and other data
  scanned in columns (`font-mono`) — including a `MetricTile`'s unit suffix.
- Cyrillic coverage is a hard requirement: verify any added face renders Russian text
  (including `locl`-dependent forms) before adopting it.
- **Numerals: `font-variant-numeric: tabular-nums` on every metric**, in labels
  as well. Non-tabular figures make numbers jitter between states and misalign in
  tables.
- **Role scale (CR-152, ADR-026)** — one utility per role, defined in
  `packages/ui/src/tokens.css` (`--fs-*` values, `--text-*` theme tokens carrying
  line height/tracking/weight). Phone values below `md` (768px), desktop from `md`:

  | Utility        | Face / weight              | Phone | Desktop    | Line height | Use                                          |
  | -------------- | -------------------------- | ----- | ---------- | ----------- | -------------------------------------------- |
  | `text-display` | Unbounded 600, −2%         | 32    | 52 (fluid) | 1.08        | a ride's title on its page                   |
  | `text-h1`      | Unbounded 600, −1.5%       | 28    | 36         | 1.12        | every page title (`h1` default)              |
  | `text-h2`      | Golos 600, −1%             | 20    | 24         | 1.25        | sections (`h2` default)                      |
  | `text-h3`      | Golos 600                  | 18    | 18         | 1.3         | cards, list items (`h3` default)             |
  | `text-body`    | Golos 400                  | 16    | 16         | 1.55        | descriptions, forms, inputs (`body` default) |
  | `text-body-sm` | Golos 400                  | 15    | 15         | 1.45        | second lines, hints, form labels, chips      |
  | `text-label`   | Plex Mono 500, caps, +6%   | 13    | 12         | 1.3         | dates, metric labels, eyebrows               |
  | `text-metric`  | Sofia Sans Extra Cond. 800 | 36    | 44         | 0.95        | large metric numerals                        |

  Buttons: Golos 600, 16px/48px tall on a phone, 15px/44px from `md`. Tailwind's own
  `text-xs` (12px) is the floor — badges, compact chips, chart axis ticks. **Nothing
  renders under 12px**; `text-sm`/`text-base`/arbitrary `text-[…]` sizes are not used for
  text in `apps/web`/`packages/ui` (relative `em` sizes inside a numeral — a unit suffix —
  are the one exception). Both `cn()` helpers register the role names with
  tailwind-merge (`packages/ui/src/lib/cn.ts`), so `cn('text-h2', 'text-text')` keeps both.

- **Rendering (CR-152):** `font-synthesis: none` (no faux bold/italic), greyscale
  antialiasing in the dark theme (light-on-dark text otherwise looks heavier),
  `text-wrap: balance` on `h1`–`h3`, `text-wrap: pretty` on `p`. Every face is loaded
  through `next/font/local`, which also generates a metric-matched fallback, so the font
  swap doesn't shift layout.
- **Weights:** Golos 400 body, 500 labels/UI, 600 headings/buttons/emphasis. Golos 800
  only for the wordmark. Unbounded 600 for display/`h1`; Sofia Sans Extra Condensed
  700/800 for metric numerals. All-caps only in the `label` role.
- **Wordmark (CR-121, updated by ADR-024):** `packages/ui`'s `Wordmark` — an
  elevation-profile mark (2:1, 0.8em tall, bottom on the baseline) in `brand` (the
  logo/graphics role, not the AA-text `primary`), then lowercase «кофе•райд» in Golos
  800 in ink (`text`), the dot a filled `brand` disc (0.24em, centred on the x-height).
  Default size 1.8rem. Accessible name «Кофе Райд» (`WORDMARK_TERMS`; the stylised
  glyphs are `aria-hidden`). The favicon (`app/icon.svg`) is the profile alone, in
  `brand`, with a dark-scheme variant.

---

## 5. Spacing, radius, elevation

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px. Nothing off-scale.
- **Radius — pills and large radii, not a stamp (ADR-024):** buttons/chips/badges are
  fully rounded (`rounded-full`); panels/cards/the route cover use large radii
  (`rounded-2xl`/`rounded-3xl`); metric cells and inputs use a medium radius
  (`rounded-xl`). Set directly per component rather than through one global `--radius`
  scale, since the mockup intentionally varies radius by element type.
- **Rules instead of fills where there's no panel:** resting content not inside a panel
  is separated by `border` hairlines; a 1.5px `frame` (ink) rule is the strong line —
  map frame, secondary-button outline. Panels themselves (§3's `bg-raised`/`surface`)
  now carry a real background, unlike ADR-021.
- **Elevation:** no shadow on resting cards. Overlays (menu popover, dialog, toast,
  sticky bar) get the one small, tight `shadow-overlay`; nothing layered, nothing
  glowing.
- **Buttons:** primary = filled `primary-fill`/`on-primary-fill` (hover
  `primary-fill-hover`), full pill radius, with a visible spinner while `isLoading`;
  secondary = 1.5px `frame` outline, no fill (hover `surface`); `danger` = danger
  outline + danger text; `danger-filled` = solid red, used by `ConfirmDialog`'s confirm
  button only.
- **Touch targets:** minimum 48px tall on mobile and 44px from `md` for buttons/primary
  actions; 44×44 px minimum for every other target. Cyclists tap this with cold hands
  and gloves on. A standalone text action («Изменить», «Удалить», «Забыли пароль?»)
  is `inline-flex min-h-11 items-center`, not bare text (CR-152); a link inside a
  sentence is exempt (WCAG 2.5.8's inline exception).
- **Focus:** a 2px `primary` outline with 2px offset on every interactive element
  (§12) — unchanged.

### Motion (CR-170)

Micro-animations instead of decoration — the owner's 2026-10-01 direction. Motion
explains a change (something appeared, moved, filled, was confirmed); it never
decorates a resting surface. Glass, gradient cards and heavy shadows stay banned (§1).

- **One vocabulary**, in `packages/ui/src/tokens.css` `@theme`: the `ease-quiet`
  curve and `animate-track-draw` (1.1 s) / `animate-check-draw` / `animate-rise-in`
  (260 ms) / `animate-fade-in` / `animate-fade-out` / `animate-segment-fill`. No
  per-component durations or easings beyond these.
- **Always `motion-safe:`** (§12). Under `prefers-reduced-motion` the final state
  renders at once; JS-driven motion (smooth scroll, the map camera) checks
  `apps/web/src/lib/motion/reduced-motion.ts` and jumps instead.
- **Finite and once.** No loops (the skeleton pulse is the one exception, §10), no
  camera movement on a hover sweep, nothing that shifts layout. The start-pin pulse
  (CR-171) is finite too: three beats, ≈ 4 s (WCAG 2.2.2).
- **Where it is used:**
  - _Track_ — `RouteCover` and the hero's `TrackCover` draw the route in from the
    start (`pathLength="1"` + `stroke-dasharray="1"`); pins fade in as the line
    reaches them. Cards below the fold hold the first frame until scrolled to
    (`useInViewOnce`, `packages/ui`).
  - _Map_ — selecting a ride on `/` (a pin click or a focused row, never a hover)
    eases the camera to frame its whole route (`fitBounds` with `durationMs`,
    600 ms, 56 px padding, max zoom 14) so the draw-in and the notes are in view;
    a ride without a route eases to its start, zoom unchanged (`panTo`). One move
    per choice: the full geometry arriving later does not move the camera again.
    (CR-170 only panned to the start; CR-172 changed it on the owner's call.)
  - _The map as the emotional layer (CR-171)_ — on `/`, the ride just made
    active (hover, focus or pin) draws its route in over 900 ms at a constant
    pace (`MapPolylineInput.drawInMs`; the full geometry replacing the preview
    continues the draw, never restarts it); its start ring pulses three times; and
    two quiet notes sit on the line, fading in as the line reaches them: the
    difficulty (word + the §6 segment meter) halfway along, and the summit
    «▲ 214 м» once the full geometry shows a climb of ≥ 30 m away from either end.
    Notes are `haloColor` pills with `--map-route` ink, non-interactive, below the
    pins.
  - _Difficulty_ — `DifficultyScale animated` fills its segments left to right
    when it scrolls into view; off by default (a grid of cards filling at once is
    noise), on for the ride page's chip.
  - _Registration status_ — the ticket's frame colour eases over and its content
    rises in when the state changes after mount; the first render is still. The
    seats bar slides to a new count.
  - _Success_ — the toast rises in, a success draws its check mark, and it fades out
    before leaving.

---

## 6. Metric presentation system

This is the part borrowed from Strava / TrainingPeaks / Rouvy, and the most reused pattern
in the product.

### MetricTile

The atom. Three parts, always in this order:

```
ДИСТАНЦИЯ          ← label:  text-label (13/12px), font-mono, text-secondary, uppercase
42,3 км            ← value:  30–36px (size="lg": text-metric 36/44px), font-num 800, tabular-nums
                      unit:   inline, ~0.45em of value size, font-mono, text-secondary
```

Rules:

- unit is **never** bold, never the same size as the number, and set in `font-mono`
  (ADR-024 — it no longer inherits the numeral face);
- the value is the only element allowed to be visually loud in a tile;
- a missing value renders as `—` (em dash), never `0` and never an empty box —
  "no elevation data" and "flat route" are different facts;
- the default tile carries no background of its own — separation comes from spacing;
  `MetricTile`'s `variant="cell"` (ADR-024, additive) opts into a `surface`-filled,
  `rounded-xl` cell for the route cover and the ride-detail headline grid, without
  changing any existing call site's default.

### MetricRow

- Desktop: 3–5 tiles in a single row.
- Mobile: 2 columns, wrapping. Never a horizontal scroller — off-screen numbers get lost.
- **Canonical order** (matches Strava/Rouvy convention, so it reads as expected):
  `дистанция → набор высоты → средний темп → длительность`.
- On a ride card, show the first **three**; the detail page shows the full row plus
  difficulty and bike type.

### Ride grid card (CR-144, «B2»)

`/`'s «Заезды» grid (`RideGridCard`). Chosen by the product owner from three mockups
after the ADR-024 card read as cluttered — every fact was stacked over the route art.

- **Cover** (`RouteCover`, fixed 160px): route track + status chip only. No route →
  no cover (CR-185): a compact head with the status chip and «Маршрут пока не
  загружен» beside a `RouteOff` icon. The chip sits in a `dark` token scope
  so its tone ink stays legible on the always-dark cover in the light theme.
- **Panel** (`bg-raised`, theme-aware), top to bottom: start line → title (Golos 600
  `text-h3`, clamped to two lines and always two lines tall, so a grid row's
  metrics/seats/tags align) → metrics line → seats → tags. CR-153 made it compact
  (owner's discovery mockup).
- **Metrics** (CR-153): one line «32 км 120 м 18 км/ч» — value `text-body` 600, unit
  mono and muted; a missing value is left out (never `0`); pace from the groups
  (range) when there are any. All three missing → «Дистанция и темп не указаны».
  Elevation is in the `elevation` ink.
- **Seats** (`SeatsMeter`): «4 из 10» + «Осталось 6 мест» (warning ink when ≤ 3 left)
  and a 6px fill bar (`warning-fill` low, `text-muted` full/closed, `primary-fill`
  otherwise; `aria-hidden`, the text carries it). Full → «Мест нет · 2 в очереди»
  (`waitlistCount`); `registration_closed` → «Запись закрыта». No limit →
  participant count + «Без ограничения мест», no bar. Cancelled → no seats block.
- **Status chip**: an open ride with ≤ 3 seats → «Мало мест» (warning); an open ride
  with none left → «Список ожидания» (info — the waitlist is joinable exactly then),
  never a green «Регистрация открыта». Cancelled: solid red chip, desaturated cover,
  struck-through muted title.
- **Tags** (32px, not interactive): bike type, difficulty word, «N группы» (≥ 2
  groups), price.
- Hover: border to `border-input` and a 2px lift (`motion-safe`); focus ring
  `primary`.

### Discovery page (CR-153)

`/`'s «Список» tab (`RideGrid`), from the owner's discovery mockup (desktop 1440 /
phone 390), top to bottom:

- **Head**: `h1` «Заезды» + one line of intro (`text-body`, secondary, ≤ 62ch); the
  «Список / Карта» switch with icons on the right (full width under the intro on a
  phone). The map tab keeps its own layout (§11) but shares the switch and chips.
- **Filter chips** (`DiscoveryFilters`, both tabs): «Любой велосипед ▾», «Эта неделя»
  (Mon–Sun, the viewer's clock), «Темп ▾» (до 20 / 20–25 / 25–30 / от 30 км/ч),
  «Сложность ▾», «Бесплатные». 44px pills; dropdowns are native `<select>`s dressed
  as chips; a chosen chip is outlined `primary` on `primary-tint` plus
  `aria-pressed`/its own value. One sideways-scrolling row on a phone. «N заездов»
  (the API's `total`) on the right from `md`.
- **Featured card** (`FeaturedRideCard`): the soonest ride that is open for
  registration and has a route (≥ 2 points), a start point and a distance
  (`isFeatureable`, CR-185); none qualifies → no featured card, never a fallback to
  a ride with an empty cover. Never repeated in the grid. `RouteCover variant="hero"` left
  (1.25fr) on desktop / 208px on top on a phone, status chip + distance tag on it;
  then «БЛИЖАЙШИЙ» (mono label, `primary`), start line, title (`text-h2`), «Старт: …»,
  three big metrics (`text-metric`, «—» when missing), seats, «Подробнее и запись»
  (primary button, full width on a phone).
- **«Все заезды»** (`text-h2`) + «Сначала ближайшие» (the total on a phone), then the
  compact cards, 3 / 2 / 1 columns.
- **«Показать ещё N заездов»** (secondary button, full width on a phone): the next
  cursor page with the first page's exact query; a failure keeps the loaded cards and
  shows an inline alert over the button.
- Not taken from the mockup: header nav «Заезды / Мои заезды / Организатору» (the
  registry nav stays), «кофе у …» (stops are not in the list payload).

### Ride poster (CR-151, «Постер заезда v2»)

`/rides/[id]`, built from the owner's «Постер заезда v2» mockup. Reading order:

- **Head**: start line (display face, caps) + a relative-day chip («завтра», «через
  5 дней» — the ride's own time zone; hidden once started/finished/cancelled) →
  title (Unbounded 700, `clamp(30px, 5.2vw, 58px)`, ≤ 17ch; muted when cancelled) →
  organizer avatar + «Организует …» + ★ rating · reviews.
- **Hero** (`RideHero`): the always-dark cover window, full-bleed on a phone, 28px
  radius from `sm`. Two faces behind a «Трек / Карта» `SegmentedControl` on the cover
  (shown only when there is something to map): the drawn track (`TrackCover` —
  the real geometry centred in the window with even margins, typed pins, and one
  sparse set of isolines around the track's centre fading outwards; no elevation
  silhouette — the profile chart below carries it, and nothing is drawn over the
  track) or the live 2GIS `RouteMap` (placeholder when degraded).
  No track → pins only, never joined, plus «Маршрут пока не загружен». Status chip
  top-left (same derivation as the grid card). Under the picture, the **numbers
  band**: distance / набор высоты (elevation ink) / средний темп (+ «N группы») /
  длительность as `MetricTile size="lg"` — always four, a missing one reads «—».
- **Ticket** (`RegistrationTicket`): every registration state on one perforated card
  (shape after 21st larsen66/admit-one-ticket, no shader/glare): a stub with the
  state's heading and a big `font-num` figure — «№ N» where the viewer would stand
  or stands in the start list, «#N» in the queue, «12/20» when closed, a ✕ when
  cancelled — then the perforation, date/start cells, the pace-group
  `SegmentedControl` (tall), seats + fill bar, the one action and a note. Outline:
  `frame`; `success` when registered; `danger` when cancelled. Sticky right-hand
  aside (380px) from `lg`; straight under the hero on a phone.
- **Phone bar** (`TicketBar`): appears only after the ticket has scrolled up out of
  view (open/few/full/registered), its button scrolls back to the ticket — never a
  second copy of the action. Hidden from `lg`.
- **Main column**: chips (difficulty, bike, price) + description; «Маршрут по
  точкам» (`RouteTimeline` — km along the track, a dashed `brand` rail through
  icon pins in the same token colours as the map pins; start with the start time,
  finish with «≈» start + duration); the elevation profile; «Скачать GPX» +
  «Поделиться» (Web Share, clipboard fallback); «Кто едет» (initials avatar stack
  with name tooltips, group split chips, «Весь список участников» expands the
  grouped list); reviews once finished.

**CR-155 — to the owner's mockup (supersedes the layout above where they differ):**

- Grid from `lg`: `minmax(0,1fr) 380px`, 32px gutter. The **hero** is the left
  column's first row (24px radius, `cover-line` hairline, picture 420px tall from
  `lg`); the **ticket** is a sticky aside spanning both rows, so it starts level
  with the hero. Phone order unchanged: head → hero → ticket → main column.
- Hero: no status chip (the status moved to the ticket's head); the numbers band is
  four equal columns in `cover-ink` — «Дистанция / Набор высоты / Темп / В пути»,
  no «N группы» note, elevation no longer amber.
- Ticket: a plain raised card (no stub/perforation) — head row «СТАРТОВЫЙ ЛИСТ» (or
  the state's title) + the ride's `StatusBadge`; the seats as the big figure
  («13» `text-metric` + «из 20 участников» mono) with the fill bar and «Осталось N
  мест» / «Мест нет · N в очереди»; «Выберите группу» as stacked radio cards
  (native radio restyled; «Группа 1 · 25 км/ч», «7 участников» — groups have no
  seat limit of their own); full-width «Записаться»; the note; then hairline action
  rows «Скачать GPX» (with a route) / «Добавить в календарь» (upcoming rides — an
  RFC 5545 `.ics` built in the browser) / «Поделиться». A registered viewer keeps
  «№ N» + countdown and the date/start cells; a queued one «#N».
- Main column, in order: «Маршрут по точкам» (km mark in mono 12px — «20 км»,
  «69,5 км»; hollow `brand` rings on a dashed `border-input` rail; a dangerous
  section gets a `warning` ring and a ⚠ before its subtitle, text in `warning`) →
  «Профиль высоты» (own section: `h2` + «макс. · мин.» readout, chart on a raised
  card) → «О заезде» (description, cover photo, difficulty/bike/price chips) beside
  «Требования» (✓ list, `success` ticks; the block and the second column only when
  the ride has requirements) → «Кто едет» → reviews.
- Registration action copy is «Записаться» (§13). Not taken: the mockup's header
  bell/avatar (the CR-154 header stays), dropping the «Трек / Карта» switch.

### Elevation profile

- Area chart: x = distance, y = elevation; single `contour` ink (ADR-021 — elevation is
  brown on every topographic map): a vertical fill gradient from 40% at the top to 12%
  at the base, a 2px non-scaling `contour` stroke and a 1px `border-input` ground line
  (CR-128 — the earlier flat ~15% fill with a 1.5px stroke nearly vanished on white).
- Y axis starts at a sensible floor, not forced to zero — a 40 m spread over 60 km should
  not render as a flat line.
- Always paired with the numeric набор высоты; the chart is an illustration, the number is
  the fact.
- Hover/touch shows distance + elevation at that point. Keyboard-accessible alternative:
  the numeric summary is always present in text.
- CR-151: drawn in real pixels (measured width) with a metres grid and a km axis; the
  readout sits in the header («43,2 км · 212 м», else «наведите — точка на обложке»),
  and the hovered distance moves a dot along the hero's track.
- CR-155: its own «Профиль высоты» section; the resting readout is «макс. 214 м · мин.
  126 м»; about three metre ticks and a km tick every ~160px.

### Difficulty

A discrete 1–5 scale rendered as filled/empty segments **plus** a word
(`Лёгкий / Ниже среднего / Средний / Сложный / Очень сложный`). Not a color gradient,
not color-only. Filled = solid `frame` ink; empty = hollow 1px `border-input` outline
(CR-128), never a `border`-hairline fill — that is ~1.5:1 on paper and disappears.

### Organizer journal (CR-173)

«Журнал организатора» on the ride page is a ledger, not a scoreboard: a hairline-ruled
`dl` of plain sentences (`Провёл 11 заездов`, `Состоялись 11 из 12 · 92 %`, `Обычно:
темп 26 км/ч, дистанция около 80 км`), `text-body-sm`, tabular numerals. No stars,
badges, progress bars or tone colours. A figure resting on too little is left out —
the percentage appears from 3 closed rides, otherwise a cancellation is named in
words; no finished rides says so plainly. Rating stays inline beside the organizer
name (CR-043).

---

## 7. Number and unit formatting (Russian locale)

Wrong formatting here reads as broken software to a Russian-speaking user. Implement once
in a shared formatter, not per component.

| Quantity       | Format                                | Example                       |
| -------------- | ------------------------------------- | ----------------------------- |
| Distance       | 1 decimal, comma separator            | `42,3 км`                     |
| Elevation      | whole meters, NBSP thousands          | `1 250 м`                     |
| Speed / pace   | 1 decimal                             | `24,5 км/ч`                   |
| Duration < 1 h | minutes                               | `45 мин`                      |
| Duration ≥ 1 h | hours + minutes                       | `2 ч 30 мин`                  |
| Date           | day + month, year only if not current | `12 мая`, `12 мая 2027`       |
| Time           | 24-hour                               | `07:30`                       |
| Price          | whole rubles, NBSP thousands          | `1 500 ₽`; free = `Бесплатно` |
| Participants   | current / limit                       | `12 из 20`                    |
| Rating         | 1 decimal, comma separator            | `4,8 ★`; no reviews yet = `—` |

- **Decimal separator is a comma**, thousands separator is a non-breaking space.
- Value and unit are joined by a **non-breaking space** so they never wrap apart.
- **Times are local to the ride's start location** and always displayed with an explicit
  city/timezone hint when it differs from the viewer's — a start time off by an hour is a
  missed ride, not a cosmetic bug.

---

## 8. Screen inventory

Public / participant:

| Route                                                | Screen                   | Notes                                                                                          |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `/`                                                  | Discovery                | «Список» (featured + grid) / «Карта» tabs, `?view=map` (ADR-024, CR-130, CR-153); filter chips |
| `/rides/[id]`                                        | Ride detail              | Cover, metrics, route + profile, stops, services, requirements, organizer, registration action |
| `/login` `/register`                                 | Auth                     |                                                                                                |
| `/forgot-password` `/reset-password` `/verify-email` | Auth flows               | CR-059, CR-060                                                                                 |
| `/me`                                                | Participant cabinet home | Widgets from the ADR-009 participant registry (CR-185)                                         |
| `/me/rides`                                          | My registrations         | Upcoming / past tabs                                                                           |
| `/me/profile`                                        | Profile settings         |                                                                                                |
| `/me/notifications`                                  | In-app notifications     | CR-041                                                                                         |

Organizer cabinet:

| Route                                | Screen                                        |
| ------------------------------------ | --------------------------------------------- |
| `/organizer`                         | Dashboard (widgets from the ADR-009 registry) |
| `/organizer/participants`            | → nearest ride's participants (CR-131)        |
| `/organizer/updates`                 | → nearest ride's updates (CR-131)             |
| `/organizer/rides`                   | My rides, grouped by status                   |
| `/organizer/rides/new`               | Create ride — wizard step 1 (CR-156)          |
| `/organizer/rides/[id]/edit`         | Ride workspace «Обзор»: draft form / overview |
| `/organizer/rides/[id]/route`        | «Маршрут»: track, GPX, stops, route points    |
| `/organizer/rides/[id]/cover`        | «Обложка»: preview, upload in a draft         |
| `/organizer/rides/[id]/groups`       | «Группы»: pace groups (ADR-022)               |
| `/organizer/rides/[id]/participants` | «Участники»: registered + waitlist            |
| `/organizer/rides/[id]/updates`      | «Обновления»: composer, preview, history      |
| `/organizer/profile`                 | Organizer profile                             |

Navigation is one global header on every route (CR-108) — wordmark, the public
discovery link, one dropdown per cabinet built from that cabinet's ADR-009 feature
registry, the theme control (§3), and the account menu. A new screen registers itself
into its registry; it does not edit the header. `CabinetShell` remains, narrowed to
the `/me/*` and `/organizer/*` session gate.

**Header bar (CR-154, discovery mockup).** Full-width `bg-raised` bar, 72px (60px on
a phone), 48px side padding from `md`. Left: the wordmark at 24px (22px on a phone),
then three pill sections — «Заезды», «Мои заезды», «Организатору» (44px, `rounded-full`,
Golos 500 `body`; the current one filled `surface`). Signed out they are plain links
(«Мои заезды» → `/me/rides`, «Организатору» → `/organizer`; each cabinet's gate sends
the visitor to `/login`); signed in, the two cabinet pills open their registry
dropdowns (with a chevron — an honest menu affordance the signed-out mockup doesn't
show). Right: the theme control as a round 44px icon button (no chevron, also on a
phone next to the menu button), then «Войти» as a ghost pill and «Регистрация» as the
filled `Button`; signed in, the account menu instead.

Exception (CR-132, mockup screen 4): `/organizer/*` is an app frame of its own and
does not show the global header. Its **organizer header** holds only the wordmark
(→ `/`), a primary «+ Создать заезд» (icon-only below `sm`) and an avatar-initials
account menu — who is signed in, «Все заезды», «Кабинет участника», the three theme
options, «Выйти» — which replaces CR-127's «Вы вошли как … Выйти» bar there (`/me/*`
keeps both). Under it, the sidebar is a full-height column with a right border
(`lg`+) and becomes a horizontally scrolling row of section pills below `lg`. A nav
descriptor may name a live `badge`; «Участники» carries the nearest ride's
registrations in the last 24 hours (hidden at 0, a sentence for screen readers).

Below `md` a **bottom tab bar** (CR-130, ADR-024 «нижние вкладки») adds five
fixed destinations — Заезды (`/`), Карта (`/?view=map`), a filled «+ Создать» pill
(`/organizer/rides/new`), Мои (`/me/rides`), Я (`/me`) — each an outline icon with a
visible label. It sits alongside the header's disclosure panel, which still holds
the full per-cabinet menus, the theme control and sign-out — an owner decision
(2026-09-26, CR-133): the two coexist, deliberately departing from ADR-024 §8's
"replaces the dropdown", since the five tabs have no room for those. It steps aside on
`/rides/[id]`, whose registration bar (CR-151: shown once the ticket scrolls away) owns that screen edge; `Toast` lifts
above it via `--app-bottom-inset`.

The organizer dashboard (`/organizer`, CR-131 — mockup screen 4) opens with the
organizer's name as an eyebrow, a time-of-day greeting and a secondary
«Отправить обновление» (the nearest ride's updates); then the active work (CR-185 —
`LiveRidesWidget`: «Заезды сейчас», «Требует решения», «Ближайшие заезды», in that
order); then four KPI cells (`OrganizerKpiWidget`, one data load shared with the
head) —
Ближайший (days to the start + a short start line), Записано (`N/M` on the nearest
ride + «+N за сутки»), Лист ожидания (the nearest ride's, «на «Название»» — all
rides only without one, CR-132), Рейтинг (+ review count), numerals one size up
(`MetricTile size="lg"`); then «Новые записи» (the newest registrations across
current rides — «Анна К. · группа 1» and the elapsed time; the ride's title only
when the list spans several rides) and «Записи по дням» (the calendar week пн–вс,
bars only, the busiest day highlighted in `brand`, a zero day a short stub; each
day's count is a screen-reader sentence, CR-132). The "nearest ride" is one
shared definition (`apps/web/src/lib/organizer/own-rides.ts`): the ride under
way, else the soonest upcoming published one. The organizer sidebar lists «Обзор»,
then the ADR-009 registry — Заезды, Участники, Обновления (both open the nearest
ride's page; an empty state when there is none), Профиль организатора. The registered viewer's block on `/rides/[id]`
opens with a days/hours/minutes countdown to the start («До старта»).

**Ride workspace (CR-187, the UX review's «Управление» tab).** Every
`/organizer/rides/[id]/*` page is one frame, `RideWorkspace`: the back link; the
status badge (plus «Требует решения» when the start passed unstarted) and the start
line in mono; the full title as the page's `h1` (Unbounded, wraps, never truncated)
with «Управление заездом» («Подготовка заезда» for a draft) under it; then the
actions in priority order — registration open: «Участники · N» (primary), «Написать
участникам», «Закрыть регистрацию» (neutral outline: closing is not cancelling);
published: «Открыть регистрацию» first; closed: «Начать заезд» first; started:
«Участники · N», «Написать», «Завершить заезд» (asks first when riders are
undecided, CR-185); finished/cancelled: no lifecycle step at all. On a phone the
buttons grow to share rows. Under the head, six local tabs — «Обзор» plus the
ADR-009 ride-section registry — as route links with `aria-current`: an underlined row
from `lg`, a bordered 3×2 grid below (6×1 from `md`; 2×3 while the tab strip is under
21rem wide — a 320–360 px phone, where a third of the width is narrower than
«Обновления», KI-085), so they never look like the cabinet's own horizontally
scrolling section strip. Each section opens with a task
heading (`h2`), one line on why it exists and a concrete status chip («Трек
загружен», «2 из 6», «5 записались», «Не отмечено: 2», «Последнее: 2 октября»).

- **Обзор**: a draft is «Перед публикацией» + its checklist + the full form; a
  published ride is «Перед стартом» (or «Заезд идёт» / «После заезда» / «Заезд
  отменён»): a checklist with one row per section — icon tile tinted by state, a
  concrete title («Маршрут готов», «Без обложки», «2 группы по темпу»), one line of
  specifics, and a link only where a step is doable («Посмотреть — Маршрут» for a
  screen reader) — then «Данные заезда» (fixed facts) beside «Связь с участниками»
  (contact, list visibility, «Следующий шаг»), then the red cancel card. States come
  from each section's own `readiness.ts`, collected by segment.
- **Маршрут / Обложка** after publish: a lock `Notice` saying why, then the result —
  the track as a provider-free sketch of the stored geometry (start/finish named in a
  legend) with «Скачать GPX» and the track facts; the cover as a 16:9 preview with
  the file rules. No disabled upload fields; stops/points without «добавьте» copy.
  A ride/track distance mismatch is a neutral reference line there, not the
  draft's yellow note with «Использовать данные трека» — neither side can change.
- **Группы**: an occupied group shows «Есть участники — удалить нельзя» instead of a
  delete button; the rules are one muted line; finished/cancelled → lock notice.
- **Участники**: «Записались» and «Лист ожидания» cards; before the start a notice
  that finish marks come after it; registration times in the ride's timezone.
- **Обновления**: recipients under the field, a live «Так увидят участники»
  preview beside it, Russian validation next to the field, history with date and
  time; a draft gets a notice instead of the composer (nobody can receive it).

Wizard mode (`?wizard=1`, CR-156) renders the same frame without the back link and
tabs — the wizard's step list is the navigation there.

The participant home (`/me`, CR-185) renders its own registry
(`lib/cabinet/participant-widgets.ts`): «Ближайшие заезды» (up to three upcoming
registrations; empty → «Найти заезд») and the organizer entry — an organizer gets
«Перейти в кабинет», anyone else the create-profile offer.

Every top-level item in the bar — plain link or dropdown trigger — shares one type
style, `packages/ui`'s `NAV_BAR_ITEM_CLASSNAME` (CR-122): Golos 600, 16px, tracking
−0.01em, icons and chevron 18px with an 8px gap, `text-secondary` idle / `text` active. The wordmark's face one step lighter, so
the bar reads as one line of type. Dropdown items (`NAV_MENU_ITEM_CLASSNAME`) stay 14px
500 as the second level.

Every nested screen carries a labeled back link to its parent (CR-109) — an explicit
destination, not browser history, since `/rides/[id]` is routinely opened from a shared
URL with no history behind it. A cabinet sidebar section itself (`/organizer/rides`,
`/organizer/profile`, CR-133) is not nested — the sidebar is always on screen and its
«Обзор» is the way back — so it carries no back link; screens below a section
(`/organizer/rides/new`, `/organizer/rides/[id]/*`) keep theirs.

---

## 9. Component inventory

**`packages/ui` (shared, both cabinets — must stay generic):**
`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `DatePicker`,
`FormField`, `Card`, `Badge`, `Tabs`, `Dialog`, `ConfirmDialog`, `Sheet`, `Toast`,
`Skeleton`, `EmptyState`, `ErrorState`, `Notice` (CR-187 — why a screen behaves as it does, in place of a disabled control), `Avatar`, `AvatarStack` (ADR-024, new — overlapping
avatars + `+N` overflow), `Pagination`, `MetricTile`, `MetricRow`, `StatusBadge`,
`DifficultyScale`, `Wordmark`, `NavMenu`, `SegmentedControl` (CR-151 — native radios in a
`fieldset`, a sliding thumb; `tall` two-line and `cover` dark-window variants),
`DatePicker` (CR-157 — see below).

`DatePicker` (CR-157) replaces the native `<input type="date">` wherever a
calendar day is picked (today: the new-ride wizard's «Дата»). The trigger shows
`formatCalendarDate` («Чт, 1 октября 2026»); the calendar is Monday-first with
48px day cells, quick picks «Сегодня / Завтра / Сб / Вс» (group rides are mostly
weekend mornings), `min` to disable past days, today ringed (not colour alone —
`aria-current="date"`), and a popover from `sm`, a bottom sheet over the scrim
on a phone. Keyboard: arrows, PageUp/PageDown, Home/End, Enter, Escape (focus
back to the trigger). Value is a plain `"YYYY-MM-DD"` — the caller still turns
day + time + zone into an instant (ADR-012).

`NavMenu` (CR-108) is the accessible dropdown the global header's sections, theme
control and account menu are all built from — `aria-haspopup="menu"`/`aria-expanded`,
`role="menu"`/`menuitem`, arrow-key/Home/End/Escape handling, and focus returned to
the trigger on Escape (§12). Like every primitive here it stays router-agnostic: the
consumer supplies its own links and applies `NAV_MENU_ITEM_CLASSNAME`.

Per `.claude/rules/extensibility.md`: new props on these are **optional with defaults**;
removing or repurposing a prop requires checking both cabinets first.

**Feature-local (inside the feature module, not shared):**
`RideCard`, `RideFilters`, `RideMap`, `RouteCover` (ADR-024, new — a route-drawn cover
built from `route-preview.ts`'s projection geometry, lives in
`features/participant/discovery/components`; only the grid card uses it),
`ElevationProfile`, `StopList`, `ServiceList`, `RequirementList`, `RegistrationTicket`
(CR-151, replaced `RegistrationButton`), `RideHero`, `TrackCover`, `RouteTimeline`, `TicketBar`,
`ParticipantTable`, `WaitlistTable`, `UpdateComposer`, `ReviewForm`, `ReviewList`.

`RideMap` and `ElevationProfile` consume `packages/maps-core` types only — never the 2GIS
SDK (ADR-010).

---

## 10. Required states per screen

Every data-bearing screen ships **five** states. A screen with only a success state is not
done (`docs/definition-of-done.md`).

1. **Loading** — skeletons matching the final layout, not a centered spinner. No layout
   shift when data lands.
2. **Empty** — explains why it is empty and offers the next action ("Пока нет заездов по
   этим фильтрам" + сбросить фильтры). Never a bare "Нет данных".
3. **Error** — plain-language message plus a retry affordance. Never a stack trace, an
   HTTP status code, or a raw server string (`.claude/rules/backend.md`).
4. **Degraded** (CR-052, `.claude/rules/resilience.md`) — a failing dependency degrades
   locally, it does not blank the page:
   - 2GIS unavailable → map area shows an inline notice, the list/route data stays usable;
     discovery's map (CR-185) also catches a basemap that never loads — «Карта
     недоступна» over the map (top on a phone, clear of the zoom buttons; bottom-left
     on desktop) with «Повторить», which re-creates only the map; the ride page's
     route map falls back to its static placeholder;
   - S3 unavailable → upload control shows "Загрузка недоступна", the rest of the form
     still submits;
   - never a blank screen, never a full-page crash for a partial failure.
5. **Success** — the normal state.

Forms additionally require, per `.claude/rules/frontend.md`: client + server validation
messages tied to the field, a pending state, and duplicate-submit protection.

Validation lines are Russian and never a Zod `issue.message` (`packages/types` writes
those in English for the API, KI-085): `apps/web/src/lib/forms/field-errors.ts` words
the failed check from its code and bounds through `VALIDATION_TERMS` («Заполните это
поле.», «Не длиннее 140 символов.», «Не может быть меньше нуля.»), or with a field's own
wording for a shape rule (`RIDE_CONTACT_VALUE_ERRORS` per contact type, the profile
phone, the start point's latitude + longitude pair). A server `validation_error` entry
carries only a path and English text, so it shows that wording or «Проверьте это поле.».
While a change saves, row actions on the same list are disabled, never silently inert.

---

## 11. Responsive

**Mobile-first — design at 375px, then scale up.** The primary context is a phone.

| Breakpoint | Width  | Layout                                                                        |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| base       | ≥ 375  | Single column; header collapses to one disclosure panel; list-first discovery |
| `sm`       | ≥ 640  | Two-column metric grid                                                        |
| `md`       | ≥ 768  | Full header bar (pill sections, §8); two-column ride detail                   |
| `lg`       | ≥ 1024 | Discovery becomes split list + map, the map sticky and full-column-height     |
| `xl`       | ≥ 1280 | Max content width 1200px, centered                                            |

CR-108 replaced the cabinets' own nav (a bottom bar at base, a side column at `md`+)
with the single global header described in §8. ADR-024/CR-130 brought two surfaces
back, both fed from the same places: the organizer's desktop sidebar (`lg`+, ADR-009
registry) and a site-wide bottom tab bar below `md` (§8). CR-132: below `lg` the
organizer sidebar's items render as a scrolling pill row under the organizer header.

Tables (participant lists) collapse to stacked cards below `md` — never a horizontally
scrolling table on a phone.

---

## 12. Accessibility target

**WCAG 2.1 level AA.** Non-negotiable items (CR-045 verifies, it does not introduce
them):

- text contrast ≥ 4.5:1, UI component boundaries ≥ 3:1 — satisfied by §3;
- visible focus ring on every interactive element (2px `primary`, 2px offset);
- full keyboard operability, including the map's essential functions — a map-only feature
  with no list equivalent is an accessibility failure;
- every input has a real `<label>`; errors are linked via `aria-describedby`;
- semantic landmarks and one `h1` per page;
- respect `prefers-reduced-motion`: no non-essential animation;
- never color alone (§1).

---

## 13. Russian UI terminology

Single source of truth for user-visible strings. The database keeps English enums; the UI
maps through this table. Do not invent synonyms per screen.

**Ride status** (`docs/product.md` lifecycle):

| Enum                  | UI                  | Tone      |
| --------------------- | ------------------- | --------- |
| `draft`               | Черновик            | neutral   |
| `published`           | Опубликован         | `success` |
| `registration_open`   | Регистрация открыта | `success` |
| `registration_closed` | Регистрация закрыта | `warning` |
| `started`             | Заезд начался       | `info`    |
| `finished`            | Завершён            | neutral   |
| `cancelled`           | Отменён             | `danger`  |

**Bicycle type:** `road` → Шоссейный · `gravel` → Гравийный · `mtb` → Горный (MTB) ·
`any` → Любой.

**Services:** Питание · Вода · Кофе · Машина сопровождения · Механик · Медицинская
поддержка · Трансфер · Перевозка велосипедов · Парковка · Раздевалка и душ.

**Metrics:** Дистанция · Набор высоты · Средний темп · Длительность · Сложность ·
Участники.

**Registration:** Записаться (CR-155; was «Зарегистрироваться») · Отменить регистрацию · В списке ожидания ·
Мест не осталось · Встать в список ожидания (CR-036) · Покинуть список ожидания
(CR-036).

Tone of voice: neutral and factual, «вы» without capitalization, no exclamation marks, no
marketing enthusiasm. Errors state what happened and what to do next, and never blame the
user.

---

## 14. Implementation notes

- Tokens live in `packages/ui` as CSS custom properties, exposed through the Tailwind
  theme so feature code writes `bg-raised` / `text-secondary`, never a hex literal.
- shadcn/ui components are vendored into `packages/ui` and re-themed to these tokens —
  the default shadcn palette is not used as-is.
- Formatters (§7) live in one shared module and are unit-tested; every metric goes
  through them.
- A lint rule rejecting raw hex colors in `apps/web` is part of CR-063.

## 15. Open questions

- Cover-image aspect ratio and crop behavior (needs a real photo sample).
- Whether the discovery map is clustered at city zoom (depends on real ride density).
- ~~Logo/wordmark: none exists...~~ Resolved (CR-107): `packages/ui`'s `Wordmark`
  component — see §4. Redrawn for «Топокарта» by ADR-021 (CR-115).
- (Superseded by ADR-021 — kept for history.) "Quiet Instrument" visual direction (CR-107) Phase 5 — any "athletic weight"
  cover-photo/route treatment beyond the glass panel in §3 — stays blocked on real,
  non-placeholder ride photography.
