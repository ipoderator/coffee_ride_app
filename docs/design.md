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

**«Топокарта» — a printed orienteering-map sheet** (ADR-021, 2026-09-23; replaces the
earlier "calm, muted teal" direction and CR-107's "Quiet Instrument"). The interface is a
planning tool people read outdoors, often on a phone, sometimes in bright sunlight or at
6 a.m. before a ride. A printed map is exactly that kind of artefact: white paper, black
ink, one overprint colour for the course, and a small, fixed set of map inks that each
mean one thing.

Rules:

- **Paper and ink.** The page is white paper (`bg`), text and rules are black ink
  (`text`, `frame`). Dark theme is the same sheet "under a head torch": neutral graphite,
  never violet- or warm-tinted.
- **One overprint colour — plum.** `primary`/`route` is used for exactly two things: the
  ride's route line on a map and the primary action (filled button, focus ring, the
  wordmark mark and dot, links). It is never decoration, never a second "brand" fill on cards,
  badges or backgrounds. If a screen seems to need a second accent, it needs hierarchy
  instead.
- **The other inks carry meaning only**, as on a real map: brown `contour` = elevation
  (elevation profile, gain), blue `info` = information, green `success` = confirmed/
  published, yellow `warning-fill`/`warning` = caution (waitlist, closing registration,
  degraded service). They are never used for ornament.
- **Cards have no fill.** Content sits on the paper as hairline-separated rows/outlines
  (`border`), the way a map legend does. `surface` (the sheet margin) is the one raised
  plane — dialogs, the sticky mobile bar, hover/selected rows.
- **Color never carries meaning alone** (`.claude/rules/frontend.md`): status, difficulty
  and errors always carry a text label and/or icon as well.
- **Banned:** gradients, glow/neon, glass/blur/translucent panels, khaki/cream/"vintage
  paper" tints, serif display faces, full-bleed saturated hero blocks. Photography (ride
  cover images) provides the only other colour; the chrome stays printed.

### The one exception: destructive semantics

The printed direction governs the interface's ordinary surfaces. Destructive and failed
states are the deliberate exception, settled by the product owner on 2026-09-10 after
reviewing a muted-brick first draft and kept unchanged by ADR-021: **cancellation uses a
genuinely bright red.** A cancelled ride is the one thing a participant must not scroll
past, and a whisper-quiet cancellation badge is a missed-ride support ticket waiting to
happen.

- `danger` is a saturated red — `#D42B20` light / `#FF5A4F` dark, both AA against their
  ground (5.04:1 on `#FFFFFF`, 6.05:1 on `#111315`);
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

Token names from CR-063 are kept (ADR-021 changed values, not names —
`.claude/rules/extensibility.md`); `surface`, `frame`, `primary-hover`, `primary-tint`,
`route`, `route-casing`, `contour`, `warning-fill`, `on-warning-fill` and `info-tint` are
additive. Contrast ratios below were computed (WCAG 2.1 relative luminance) against the
theme's `bg`, with the value against `surface` in brackets where it matters; they meet AA
(4.5:1 for text, 3:1 for UI component boundaries and graphics).

**Page vs card.** `bg` is the paper. `bg-raised` is deliberately the _same_ paper, not a
tint: cards and form controls have no fill of their own and are separated by hairlines.
`surface` (the sheet margin) is the one raised plane — dialogs, the sticky mobile bar,
hover and selected rows, segmented-control tracks.

### Light theme

| Token             | Hex       | Contrast                  | Use                                                            |
| ----------------- | --------- | ------------------------- | -------------------------------------------------------------- |
| `bg`              | `#FFFFFF` | —                         | Page background — the paper                                    |
| `bg-raised`       | `#FFFFFF` | —                         | Cards, inputs, menus — same paper, no fill of their own        |
| `surface`         | `#F3F4F1` | —                         | Sheet margin: dialogs, sticky bar, hover/selected rows         |
| `text`            | `#15171A` | 17.96:1 (16.27)           | Primary text — the ink                                         |
| `text-secondary`  | `#4B5157` | 8.03:1 (7.28)             | Labels, captions, metric labels                                |
| `text-muted`      | `#676D74` | 5.23:1 (4.74)             | Least-important text; still AA                                 |
| `frame`           | `#15171A` | 17.96:1                   | Ink rule: map frame, secondary-button outline, strong dividers |
| `border`          | `#D3D6D9` | decorative                | Hairlines between rows, card outlines                          |
| `border-input`    | `#858B92` | 3.44:1 (3.12)             | Form control boundaries (AA for UI components)                 |
| `primary`         | `#9033A1` | 6.62:1 (5.99)             | Overprint: primary button, links, focus ring, wordmark marks   |
| `primary-hover`   | `#772A85` | 8.55:1                    | Primary button hover                                           |
| `on-primary`      | `#FFFFFF` | 6.62:1 on `primary`       | Text on primary fill                                           |
| `primary-tint`    | `#F6EEF7` | `primary` on it 5.83:1    | Selected state behind overprint content (sparingly)            |
| `route`           | `#9033A1` | 6.62:1                    | The ride's route line on a map (6px) — same value as `primary` |
| `route-casing`    | `#FFFFFF` | route on it 6.62:1        | Casing under the route line                                    |
| `contour`         | `#8C5419` | 6.18:1 (5.60)             | Elevation: profile chart, gain                                 |
| `success`         | `#1D6F38` | 6.21:1 (5.62)             | Registration confirmed, published                              |
| `warning`         | `#7A5300` | 6.85:1 (6.21)             | Warning **text**: waitlist, closing registration, degraded     |
| `warning-fill`    | `#FFC94D` | —                         | Warning fill (badge/notice background)                         |
| `on-warning-fill` | `#15171A` | 11.73:1 on `warning-fill` | Ink text on the warning fill                                   |
| `info`            | `#0B65A6` | 6.13:1 (5.55)             | Neutral informational notes, ride updates                      |
| `info-tint`       | `#E3F0FA` | `info` on it 5.29:1       | Info notice background                                         |
| `danger`          | `#D42B20` | 5.04:1 (4.57)             | Cancellation, destructive action, validation error (unchanged) |
| `on-danger`       | `#FFFFFF` | 5.04:1 on `danger`        | Text on a filled danger badge/button                           |

### Dark theme — «sheet under a head torch»

| Token             | Hex       | Contrast                  | Use                                    |
| ----------------- | --------- | ------------------------- | -------------------------------------- |
| `bg`              | `#111315` | —                         | Page background — graphite, not violet |
| `bg-raised`       | `#111315` | —                         | Same as `bg` (no card fill)            |
| `surface`         | `#1A1D20` | —                         | Sheet margin                           |
| `text`            | `#ECEDEA` | 15.84:1 (14.40)           | Primary text                           |
| `text-secondary`  | `#B4B9BE` | 9.42:1 (8.56)             | Labels, captions                       |
| `text-muted`      | `#8E959C` | 6.14:1 (5.59)             | Least-important text                   |
| `frame`           | `#ECEDEA` | 15.84:1                   | Ink rule                               |
| `border`          | `#343A40` | decorative                | Hairlines                              |
| `border-input`    | `#6E767E` | 4.04:1 (3.67)             | Form control boundaries                |
| `primary`         | `#D79BE0` | 8.56:1 (7.78)             | Overprint                              |
| `primary-hover`   | `#E4B6EB` | 10.81:1                   | Primary button hover                   |
| `on-primary`      | `#1C0F1E` | 8.50:1 on `primary`       | Text on primary fill                   |
| `primary-tint`    | `#2C1F2F` | `primary` on it 7.18:1    | Selected state (sparingly)             |
| `route`           | `#D79BE0` | 8.56:1                    | Route line — same value as `primary`   |
| `route-casing`    | `#111315` | route on it 8.56:1        | Casing under the route line            |
| `contour`         | `#D39B5F` | 7.65:1 (6.95)             | Elevation                              |
| `success`         | `#62C483` | 8.64:1 (7.85)             | —                                      |
| `warning`         | `#F0C04E` | 10.95:1 (9.96)            | Warning text                           |
| `warning-fill`    | `#F0C04E` | —                         | Warning fill                           |
| `on-warning-fill` | `#111315` | 10.95:1 on `warning-fill` | Text on the warning fill               |
| `info`            | `#6DB4EE` | 8.35:1 (7.59)             | —                                      |
| `info-tint`       | `#15293A` | `info` on it 6.68:1       | Info notice background                 |
| `danger`          | `#FF5A4F` | 6.05:1 (5.50)             | Unchanged                              |
| `on-danger`       | `#171614` | 5.88:1 on `danger`        | Text on a filled danger badge          |

Dark theme is not optional or "later": it is part of CR-063. An app used before dawn and
after dusk needs it.

Since CR-110 the viewer can also choose explicitly — системная / светлая / тёмная, from
the global header. Three states, not a two-way switch, so picking one does not
permanently discard the "follow the OS" default. The choice is stored per browser
(`localStorage`, key `coffee-ride-theme`) and applied by a pre-hydration script in
`app/layout.tsx`, so there is no flash of the wrong theme on first paint; every storage
access is guarded, since it throws outright in a private window with site data blocked.

### Retired: glass tokens (CR-107 → ADR-021)

`glass-bg`/`glass-border` and `packages/ui`'s `GLASS_PANEL_CLASSNAME` belonged to the
"Quiet Instrument" direction, which ADR-021 replaced; «Топокарта» bans glass and blur.
Deleted by CR-119, together with both flags that gated their consumers
(`FEATURE_COVER_GLASS_PANEL`, `FEATURE_STICKY_REGISTRATION_CTA`), once the discovery
and ride-detail rebuilds dropped the last call sites. The sticky mobile registration bar
on `/rides/[id]` stays — it is the default now, a `surface` sheet with an ink rule.

`scrim` (`rgb(21 23 26 / 55%)`, ink at 55%, same in both themes) stays: it is a wash
under text placed on a user-uploaded photo, needed for contrast whatever the photo is —
a legibility device, not glass.

### Data visualization colors

Charts use the map's own inks, never a categorical rainbow. The **elevation profile is
`contour` brown** (40%→12% gradient fill + 2px stroke, CR-128), the colour elevation has on every
topographic map. `chart-secondary` survives as a name (also the `food` route-point
marker) and aliases `contour`. Difficulty and status are encoded by **label + position
on a scale**, not by hue. The route line itself is `route` over `route-casing`, 6px.

---

## 4. Typography

- **Body/UI: Golos Text** (Paratype) — a grotesque drawn for Russian text, with Cyrillic
  as a first-class script — over the system stack (`-apple-system, "Segoe UI", Roboto,
sans-serif`). Utility class `font-sans` (the default).
- **Display/labels/numerals: Sofia Sans Condensed** — headings (`h1`–`h3` by default,
  `globals.css`), small uppercase labels, metric values and the wordmark. Utility class
  `font-display`, token `--font-display`; fallback `"Arial Narrow"` then the body stack.
  Loaded as a variable font via `next/font/google` with `subsets: ['cyrillic', 'latin']`.
- **Russian letterforms depend on `lang="ru"`.** Sofia Sans' default Cyrillic is drawn in
  the Bulgarian style (в/д/и/т look like b/g/u/m); the Russian forms come from its
  `locl` OpenType feature, which browsers apply only when the text's language is Russian.
  `<html lang="ru">` in `app/layout.tsx` guarantees that — never remove it and never set
  another `lang` on an element rendered in `font-display` (verified in the browser for
  CR-115: the same string renders Russian forms under `ru`, Bulgarian under `bg`).
- **IBM Plex Mono** stays the utility face for hex values, IDs and other data scanned in
  columns (`font-mono`).
- Cyrillic coverage is a hard requirement: verify any added face renders Russian text
  (including `locl`-dependent forms) before adopting it.
- **Numerals: `font-variant-numeric: tabular-nums` on every metric**, in `font-display`
  as well. Non-tabular figures make numbers jitter between states and misalign in
  tables.
- **Scale** (mobile → desktop): 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 px. Body is 16px
  minimum — never 14px for reading text on mobile. A condensed display face reads
  smaller than Golos at the same size; prefer the next step up for headings rather than a
  heavier weight.
- **Weights:** Golos 400 body, 500 labels/UI, 600 emphasis. Golos 800 only for the wordmark.
  Sofia Sans Condensed 600 for headings and metric values. All-caps only for small labels
  (12px, letter-spacing ≈0.06em) in `font-display`.
- **Line height:** 1.5 body, 1.2 headings and metric values.
- **Wordmark (CR-121, supersedes ADR-021's «coffee◦ride»):** `packages/ui`'s `Wordmark` —
  an elevation-profile mark (2:1, 0.8em tall, bottom on the baseline) in `primary`, then
  lowercase «кофе•райд» in Golos 800 in ink (`text`), the dot a filled `primary` disc
  (0.24em, centred on the x-height). Default size 1.8rem. Accessible name «Кофе Райд»
  (`WORDMARK_TERMS`; the stylised glyphs are `aria-hidden`). The favicon
  (`app/icon.svg`) is the profile alone, plum, with a dark-scheme variant.

---

## 5. Spacing, radius, elevation

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px. Nothing off-scale.
- **Radius — a printed stamp, not a pill:** 4px on buttons, inputs, chips/badges and menu
  items (`rounded-md`/`rounded-lg` both resolve to 4px); 6px (`rounded-xl`) for cards,
  dialogs and sheets; 2px (`rounded-sm`) for small inset marks. `rounded-full` only for
  avatars and circular map marks.
- **Rules instead of fills:** resting content is separated by `border` hairlines; a
  1.5px `frame` (ink) rule is the strong line — map frame, secondary-button outline.
- **Elevation:** no shadow on cards, ever. Overlays (menu popover, dialog, toast, sticky
  bar) get the one small, tight `shadow-overlay`; nothing layered, nothing glowing.
- **Buttons:** primary = filled `primary`/`on-primary` (hover `primary-hover`);
  secondary = 1.5px `frame` outline, no fill (hover `surface`); `danger` = danger
  outline + danger text; `danger-filled` = solid red, used by `ConfirmDialog`'s confirm
  button only.
- **Touch targets:** minimum 48px tall on mobile and 44px from `md` for buttons/primary
  actions; 44×44 px minimum for every other target. Cyclists tap this with cold hands
  and gloves on.
- **Focus:** a 2px `primary` outline with 2px offset on every interactive element
  (§12) — unchanged.

---

## 6. Metric presentation system

This is the part borrowed from Strava / TrainingPeaks / Rouvy, and the most reused pattern
in the product.

### MetricTile

The atom. Three parts, always in this order:

```
ДИСТАНЦИЯ          ← label:  12px, 500, text-secondary, uppercase, 0.04em
42,3 км            ← value:  24–30px, 600, text, tabular-nums
                      unit:   inline, 0.6em of value size, 400, text-secondary
```

Rules:

- unit is **never** bold and never the same size as the number;
- the value is the only element allowed to be visually loud in a tile;
- a missing value renders as `—` (em dash), never `0` and never an empty box —
  "no elevation data" and "flat route" are different facts;
- tiles never carry their own background color; separation comes from spacing.

### MetricRow

- Desktop: 3–5 tiles in a single row.
- Mobile: 2 columns, wrapping. Never a horizontal scroller — off-screen numbers get lost.
- **Canonical order** (matches Strava/Rouvy convention, so it reads as expected):
  `дистанция → набор высоты → средний темп → длительность`.
- On a ride card, show the first **three**; the detail page shows the full row plus
  difficulty and bike type.

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

### Difficulty

A discrete 1–5 scale rendered as filled/empty segments **plus** a word
(`Лёгкий / Ниже среднего / Средний / Сложный / Очень сложный`). Not a color gradient,
not color-only. Filled = solid `frame` ink; empty = hollow 1px `border-input` outline
(CR-128), never a `border`-hairline fill — that is ~1.5:1 on paper and disappears.

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
| `/`                                                  | Discovery                | List + map toggle; filters. Mobile default = list                                              |
| `/rides/[id]`                                        | Ride detail              | Cover, metrics, route + profile, stops, services, requirements, organizer, registration action |
| `/login` `/register`                                 | Auth                     |                                                                                                |
| `/forgot-password` `/reset-password` `/verify-email` | Auth flows               | CR-059, CR-060                                                                                 |
| `/me`                                                | Participant cabinet home |                                                                                                |
| `/me/rides`                                          | My registrations         | Upcoming / past tabs                                                                           |
| `/me/profile`                                        | Profile settings         |                                                                                                |
| `/me/notifications`                                  | In-app notifications     | CR-041                                                                                         |

Organizer cabinet:

| Route                                | Screen                                        |
| ------------------------------------ | --------------------------------------------- |
| `/organizer`                         | Dashboard (widgets from the ADR-009 registry) |
| `/organizer/rides`                   | My rides, grouped by status                   |
| `/organizer/rides/new`               | Create ride                                   |
| `/organizer/rides/[id]/edit`         | Edit draft                                    |
| `/organizer/rides/[id]/route`        | Route, GPX upload, stops, route points        |
| `/organizer/rides/[id]/participants` | Participants + waitlist                       |
| `/organizer/rides/[id]/updates`      | Ride updates composer                         |
| `/organizer/profile`                 | Organizer profile                             |

Navigation is one global header on every route (CR-108) — wordmark, the public
discovery link, one dropdown per cabinet built from that cabinet's ADR-009 feature
registry, the theme control (§3), and the account menu. A new screen registers itself
into its registry; it does not edit the header. `CabinetShell` remains, narrowed to
the `/me/*` and `/organizer/*` session gate.

Every top-level item in the bar — plain link or dropdown trigger — shares one type
style, `packages/ui`'s `NAV_BAR_ITEM_CLASSNAME` (CR-122): Golos 600, 16px, tracking
−0.01em, icons and chevron 18px with an 8px gap, `text-secondary` idle / `text` active. The wordmark's face one step lighter, so
the bar reads as one line of type. Dropdown items (`NAV_MENU_ITEM_CLASSNAME`) stay 14px
500 as the second level.

Every nested screen carries a labeled back link to its parent (CR-109) — an explicit
destination, not browser history, since `/rides/[id]` is routinely opened from a shared
URL with no history behind it.

---

## 9. Component inventory

**`packages/ui` (shared, both cabinets — must stay generic):**
`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `DatePicker`,
`FormField`, `Card`, `Badge`, `Tabs`, `Dialog`, `ConfirmDialog`, `Sheet`, `Toast`,
`Skeleton`, `EmptyState`, `ErrorState`, `Avatar`, `Pagination`, `MetricTile`,
`MetricRow`, `StatusBadge`, `DifficultyScale`, `Wordmark`, `NavMenu`.

`NavMenu` (CR-108) is the accessible dropdown the global header's sections, theme
control and account menu are all built from — `aria-haspopup="menu"`/`aria-expanded`,
`role="menu"`/`menuitem`, arrow-key/Home/End/Escape handling, and focus returned to
the trigger on Escape (§12). Like every primitive here it stays router-agnostic: the
consumer supplies its own links and applies `NAV_MENU_ITEM_CLASSNAME`.

Per `.claude/rules/extensibility.md`: new props on these are **optional with defaults**;
removing or repurposing a prop requires checking both cabinets first.

**Feature-local (inside the feature module, not shared):**
`RideCard`, `RideFilters`, `RideMap`, `ElevationProfile`, `StopList`, `ServiceList`,
`RequirementList`, `RegistrationButton`, `ParticipantTable`, `WaitlistTable`,
`UpdateComposer`, `ReviewForm`, `ReviewList`.

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
   - S3 unavailable → upload control shows "Загрузка недоступна", the rest of the form
     still submits;
   - never a blank screen, never a full-page crash for a partial failure.
5. **Success** — the normal state.

Forms additionally require, per `.claude/rules/frontend.md`: client + server validation
messages tied to the field, a pending state, and duplicate-submit protection.

---

## 11. Responsive

**Mobile-first — design at 375px, then scale up.** The primary context is a phone.

| Breakpoint | Width  | Layout                                                                        |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| base       | ≥ 375  | Single column; header collapses to one disclosure panel; list-first discovery |
| `sm`       | ≥ 640  | Two-column metric grid                                                        |
| `md`       | ≥ 768  | Full header bar (sections as dropdowns); two-column ride detail               |
| `lg`       | ≥ 1024 | Discovery becomes split list + map, the map sticky and full-column-height     |
| `xl`       | ≥ 1280 | Max content width 1200px, centered                                            |

CR-108 replaced the cabinets' own nav (a bottom bar at base, a side column at `md`+)
with the single global header described in §8 — there is no longer a per-cabinet
navigation surface to break at a breakpoint.

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

**Registration:** Зарегистрироваться · Отменить регистрацию · В списке ожидания ·
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
