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

**Calm, low-saturation, content-first.** The interface is a planning tool people read
outdoors, often on a phone, sometimes in bright sunlight or at 6 a.m. before a ride.
Legibility and quiet hierarchy beat personality.

Rules:
- **No neon, no vivid saturated accents, no bright red as decoration.** Keep accent
  saturation moderate (roughly ≤ 45% HSL saturation); nothing should glow or vibrate
  against the background.
- **Warm neutral base**, not clinical blue-gray. Surfaces are off-white/warm stone in
  light theme, warm near-black in dark theme.
- **One accent color** (muted teal-green) for interactive elements. Do not introduce a
  second brand accent per feature — that is how a dashboard turns into a fruit salad.
- **Color never carries meaning alone** (`.claude/rules/frontend.md`): status, difficulty
  and errors always carry a text label and/or icon as well.
- No gradients on data surfaces, no glow/neon shadows, no full-bleed saturated hero
  blocks. Photography (ride cover images) provides the color; the chrome stays quiet.

### The one deliberate exception: destructive semantics

"No red" is the stated direction, and the palette follows it — nothing in the interface is
vivid red. But cancellation, deletion and validation failure still need to be
distinguishable from an ordinary action, and a fully red-free interface either hides those
states or overloads another color. The compromise recorded here:

- destructive/error uses a **muted brick tone** (`#8F4F47`), not a saturated red;
- it is used for **text, icon and 1px borders only** — never as a large filled area;
- it never appears without an accompanying word ("Отменён", "Ошибка") or icon.

If that still reads as too red in review, the fallback is desaturating further toward
warm gray-brown — but the state must remain visually distinct from a neutral one.

---

## 2. Reference products

Take **information design** from endurance-sport tools, not their branding. All five have
solved "show a route and its numbers to an athlete on a phone."

| Product | What to borrow | What to avoid |
|---|---|---|
| Strava | Metric row under the map (distance / elevation / time); activity-card hierarchy; elevation profile tied to the route | The signature bright orange (`#FC4C02`) — exactly the kind of vivid accent this project rejects |
| TrainingPeaks | Dense but readable metric tables; clear label→value→unit typographic hierarchy; muted chart fills | Coach-grade information density; MVP shows a handful of numbers, not a full analytics workspace |
| FinalSurge | Calm, restrained neutral chrome; list/calendar layouts for upcoming events | Dated form styling |
| Zwift | Legibility of large numbers at a glance and from a distance | Neon/gamified visual language entirely |
| Rouvy | Route-first layout: profile + key numbers + difficulty as a discrete scale | Photo-heavy immersive treatment |

Common pattern worth stating explicitly: in all of them the **route and its numbers are
the page**, and the interface chrome disappears. Coffee Ride should read the same way.

---

## 3. Color tokens

Semantic names only. Feature code never hard-codes a hex value — it uses these tokens
via the Tailwind theme.

Contrast ratios below were computed against the theme background and meet WCAG 2.1 AA
(4.5:1 for text, 3:1 for UI component boundaries).

### Light theme

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `bg` | `#FAF9F7` | — | Page background (warm off-white) |
| `bg-raised` | `#FFFFFF` | — | Cards, sheets, popovers |
| `text` | `#23211E` | 15.26:1 | Primary text |
| `text-secondary` | `#5F5952` | 6.57:1 | Labels, captions, metric labels |
| `text-muted` | `#767068` | 4.65:1 | Least-important text; still AA |
| `primary` | `#35635A` | 6.47:1 | Links, primary buttons, focus ring, active nav |
| `on-primary` | `#FFFFFF` | 6.81:1 on `primary` | Text on primary fill |
| `success` | `#3F6B4E` | 5.83:1 | Registration confirmed, published |
| `warning` | `#8A6520` | 5.04:1 | Waitlist, registration closing, degraded service |
| `danger` | `#8F4F47` | 5.91:1 | Cancellation, destructive action, validation error |
| `info` | `#3D5F85` | 6.29:1 | Neutral informational notes, ride updates |
| `border` | `#E4E0D9` | decorative | Dividers, card outlines |
| `border-input` | `#8C857D` | 3.46:1 | Form control boundaries (AA for UI components) |

### Dark theme

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `bg` | `#171614` | — | Page background (warm near-black) |
| `bg-raised` | `#201F1C` | — | Cards, sheets, popovers |
| `text` | `#EDEAE4` | 15.06:1 | Primary text |
| `text-secondary` | `#ABA49B` | 7.33:1 | Labels, captions |
| `text-muted` | `#8C857C` | 4.96:1 | Least-important text |
| `primary` | `#7FB3A6` | 7.66:1 | Links, primary actions, focus ring |
| `on-primary` | `#171614` | 7.66:1 on `primary` | Text on primary fill |
| `success` | `#84AE8F` | 7.26:1 | — |
| `warning` | `#C6A063` | 7.41:1 | — |
| `danger` | `#C98D84` | 6.57:1 | — |
| `info` | `#8CACCE` | 7.67:1 | — |
| `border` | `#302D29` | decorative | — |
| `border-input` | `#736E66` | 3.57:1 | Form control boundaries |

Dark theme is not optional or "later": it is part of CR-063. An app used before dawn and
after dusk needs it.

### Data visualization colors

Charts (elevation profile, future statistics) use a **single muted fill** derived from
`primary` at low opacity, not a categorical rainbow. If a second series is ever needed,
add a muted clay tone (`#A8705A` light / `#C29580` dark) and stop there. Difficulty and
status are encoded by **label + position on a scale**, not by hue.

---

## 4. Typography

- **Family:** system stack first (`-apple-system, "Segoe UI", Roboto, "Helvetica Neue",
  sans-serif`), Inter as an optional self-hosted upgrade. No decorative or display face.
  Cyrillic coverage is a hard requirement — verify any added face renders Russian text.
- **Numerals: `font-variant-numeric: tabular-nums` on every metric.** Non-tabular figures
  make numbers jitter between states and misalign in tables; this is the single most
  visible difference between an amateur and a professional metrics UI.
- **Scale** (mobile → desktop): 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 px. Body is 16px
  minimum — never 14px for reading text on mobile.
- **Weights:** 400 body, 500 labels/UI, 600 headings and metric values. No 700+ and no
  all-caps except small metric labels (12px, letter-spacing 0.04em).
- **Line height:** 1.5 body, 1.2 headings and metric values.

---

## 5. Spacing, radius, elevation

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px. Nothing off-scale.
- **Radius:** 8px default (cards, inputs, buttons), 12px for large surfaces/sheets, full
  for pills/badges.
- **Elevation:** at most two levels — a hairline border for resting cards, a soft low
  shadow for overlays (popover/modal/sheet). No layered drop shadows.
- **Touch targets:** minimum 44×44 px. Cyclists tap this with cold hands and gloves on.

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

- Area chart: x = distance, y = elevation; single muted `primary` fill at ~15% opacity
  with a 1.5px stroke.
- Y axis starts at a sensible floor, not forced to zero — a 40 m spread over 60 km should
  not render as a flat line.
- Always paired with the numeric набор высоты; the chart is an illustration, the number is
  the fact.
- Hover/touch shows distance + elevation at that point. Keyboard-accessible alternative:
  the numeric summary is always present in text.

### Difficulty

A discrete 1–5 scale rendered as filled/empty segments **plus** a word
(`Лёгкий / Ниже среднего / Средний / Сложный / Очень сложный`). Not a color gradient,
not color-only.

---

## 7. Number and unit formatting (Russian locale)

Wrong formatting here reads as broken software to a Russian-speaking user. Implement once
in a shared formatter, not per component.

| Quantity | Format | Example |
|---|---|---|
| Distance | 1 decimal, comma separator | `42,3 км` |
| Elevation | whole meters, NBSP thousands | `1 250 м` |
| Speed / pace | 1 decimal | `24,5 км/ч` |
| Duration < 1 h | minutes | `45 мин` |
| Duration ≥ 1 h | hours + minutes | `2 ч 30 мин` |
| Date | day + month, year only if not current | `12 мая`, `12 мая 2027` |
| Time | 24-hour | `07:30` |
| Price | whole rubles, NBSP thousands | `1 500 ₽`; free = `Бесплатно` |
| Participants | current / limit | `12 из 20` |

- **Decimal separator is a comma**, thousands separator is a non-breaking space.
- Value and unit are joined by a **non-breaking space** so they never wrap apart.
- **Times are local to the ride's start location** and always displayed with an explicit
  city/timezone hint when it differs from the viewer's — a start time off by an hour is a
  missed ride, not a cosmetic bug.

---

## 8. Screen inventory

Public / participant:

| Route | Screen | Notes |
|---|---|---|
| `/` | Discovery | List + map toggle; filters. Mobile default = list |
| `/rides/[id]` | Ride detail | Cover, metrics, route + profile, stops, services, requirements, organizer, registration action |
| `/login` `/register` | Auth | |
| `/forgot-password` `/reset-password` `/verify-email` | Auth flows | CR-059, CR-060 |
| `/me` | Participant cabinet home | |
| `/me/rides` | My registrations | Upcoming / past tabs |
| `/me/profile` | Profile settings | |
| `/me/notifications` | In-app notifications | CR-041 |

Organizer cabinet:

| Route | Screen |
|---|---|
| `/organizer` | Dashboard (widgets from the ADR-009 registry) |
| `/organizer/rides` | My rides, grouped by status |
| `/organizer/rides/new` | Create ride |
| `/organizer/rides/[id]/edit` | Edit draft |
| `/organizer/rides/[id]/route` | Route, GPX upload, stops, route points |
| `/organizer/rides/[id]/participants` | Participants + waitlist |
| `/organizer/rides/[id]/updates` | Ride updates composer |
| `/organizer/profile` | Organizer profile |

Both cabinets share a shell (nav + header) that renders from the feature registry
(ADR-009). A new screen registers itself; it does not edit the shell.

---

## 9. Component inventory

**`packages/ui` (shared, both cabinets — must stay generic):**
`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `DatePicker`,
`FormField`, `Card`, `Badge`, `Tabs`, `Dialog`, `Sheet`, `Toast`, `Skeleton`,
`EmptyState`, `ErrorState`, `Avatar`, `Pagination`, `MetricTile`, `MetricRow`,
`StatusBadge`, `DifficultyScale`.

Per `.claude/rules/extensibility.md`: new props on these are **optional with defaults**;
removing or repurposing a prop requires checking both cabinets first.

**Feature-local (inside the feature module, not shared):**
`RideCard`, `RideFilters`, `RideMap`, `ElevationProfile`, `StopList`, `ServiceList`,
`RequirementList`, `RegistrationButton`, `ParticipantTable`, `WaitlistTable`,
`UpdateComposer`, `ReviewForm`.

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

| Breakpoint | Width | Layout |
|---|---|---|
| base | ≥ 375 | Single column; bottom nav in cabinets; list-first discovery |
| `sm` | ≥ 640 | Two-column metric grid |
| `md` | ≥ 768 | Side nav appears; two-column ride detail |
| `lg` | ≥ 1024 | Discovery becomes split list + map |
| `xl` | ≥ 1280 | Max content width 1200px, centered |

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

| Enum | UI | Tone |
|---|---|---|
| `draft` | Черновик | neutral |
| `published` | Опубликован | `success` |
| `registration_open` | Регистрация открыта | `success` |
| `registration_closed` | Регистрация закрыта | `warning` |
| `started` | Заезд начался | `info` |
| `finished` | Завершён | neutral |
| `cancelled` | Отменён | `danger` |

**Bicycle type:** `road` → Шоссейный · `gravel` → Гравийный · `mtb` → Горный (MTB) ·
`any` → Любой.

**Services:** Питание · Вода · Кофе · Машина сопровождения · Механик · Медицинская
поддержка · Трансфер · Перевозка велосипедов · Парковка · Раздевалка и душ.

**Metrics:** Дистанция · Набор высоты · Средний темп · Длительность · Сложность ·
Участники.

**Registration:** Зарегистрироваться · Отменить регистрацию · В списке ожидания ·
Мест не осталось.

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
- Logo/wordmark: none exists; a text wordmark in the base typeface is the MVP placeholder.
