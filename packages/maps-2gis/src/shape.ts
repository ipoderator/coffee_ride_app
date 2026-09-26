import { MapProviderError } from './errors.js';

// CR-137. 2GIS bodies arrive as `unknown` JSON. The parsers narrow them
// field by field instead of casting, and anything outside the known shape
// becomes this error: `unavailable`, the same as an outage, so callers
// degrade instead of crashing on a TypeError. It is deliberately not
// `no_route` — that tells the organizer the points can't be connected,
// which a malformed answer doesn't show.
export function unexpectedShape(what: string): MapProviderError {
  return new MapProviderError(
    `2GIS response had an unexpected shape: ${what}.`,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `undefined` → `[]`; a list → itself; anything else is unexpected. */
export function optionalList(value: unknown, what: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw unexpectedShape(`${what} is not a list`);
  return value;
}
