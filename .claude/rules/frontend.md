# Frontend Rules

Read `docs/design.md` before building any screen or shared component. It is the source of
truth for palette/tokens, typography, metric presentation, Russian formatting and
terminology, screen inventory, required UI states, breakpoints, and the WCAG 2.1 AA
target. This file states the rules; `docs/design.md` states the concrete values.

Never hard-code a color, spacing value, or user-visible Russian string in a component —
use the tokens and the shared formatter/terminology module.

## UX priorities

Participant:
map/list → ride card → ride details → registration.

Organizer:
dashboard → create/edit ride → route/stops/services → publish → participants.

## Components

Use small, composable components.
Do not put persistence/business rules into presentational components.

## Data

Use typed API clients for server communication.
Keep server state separate from local UI state.

## Forms

Important forms require:
- runtime validation;
- loading state;
- server error handling;
- duplicate-submit protection;
- useful empty/error states.

## Maps

Keep 2GIS-specific objects inside the map integration boundary.
Shared domain types must remain provider-neutral.

## Metrics

Distance, elevation, pace, duration and participant counts follow the `MetricTile`
pattern and the Russian formatting rules in `docs/design.md` (§6, §7): tabular numerals,
unit smaller and unemphasized, missing data as `—` and never `0`.

## Accessibility

Interactive elements need labels and keyboard support.
Do not rely on color alone for important information.
Target level is WCAG 2.1 AA — see `docs/design.md` §12.
