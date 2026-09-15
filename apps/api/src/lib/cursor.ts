/**
 * Opaque cursor pagination (ADR-011 §2, `docs/api.md` → "Pagination"). First real
 * implementation — `GET /v1/rides/mine` (CR-088) is the first collection endpoint;
 * every later one (participants, updates, reviews, `GET /v1/rides`) reuses this same
 * helper instead of re-deriving its own encoding.
 *
 * The cursor encodes the sort key of the last row on the previous page — `sortValue`
 * plus the row's `id` as a tiebreaker. Different endpoints sort by different columns
 * (`/mine`'s `createdAt` vs. `GET /v1/rides`'s `startsAt`, CR-025), so the field name
 * is generic on purpose. It is never parsed or constructed client-side (ADR-011) —
 * only this module reads/writes it.
 */

export class CursorError extends Error {
  constructor() {
    super('Cursor is not a valid opaque pagination cursor.');
    this.name = 'CursorError';
  }
}

// `sortValue` is deliberately generic, not `createdAt` — CR-025 ("Filters") added a
// second collection endpoint sorted by a different column (`GET /v1/rides`'s
// `startsAt`, vs `/mine`'s `createdAt`). The cursor is opaque and never parsed
// client-side (ADR-011), so the field name is an internal implementation detail, safe
// to rename without a contract change.
export interface CursorKey {
  sortValue: string;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new CursorError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as CursorKey).sortValue !== 'string' ||
    typeof (parsed as CursorKey).id !== 'string'
  ) {
    throw new CursorError();
  }
  return parsed as CursorKey;
}

/** ADR-011: `limit` default 20, maximum 100 — clamps rather than errors. */
export function clampLimit(
  requested: number | undefined,
  { defaultLimit = 20, maxLimit = 100 } = {},
): number {
  if (requested === undefined || Number.isNaN(requested)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(requested), 1), maxLimit);
}
