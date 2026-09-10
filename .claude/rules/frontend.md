# Frontend Rules

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

## Accessibility

Interactive elements need labels and keyboard support.
Do not rely on color alone for important information.
