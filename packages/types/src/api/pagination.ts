/**
 * Cursor-pagination envelope every collection endpoint returns — shape fixed
 * by ADR-011 (`docs/api.md` → "Pagination"). No collection endpoint exists
 * yet (first one is CR-024's ride list); this type is defined now so its
 * first real usage imports the shared shape instead of re-deriving it.
 */
export interface Paginated<T> {
  items: T[];
  /** Opaque to the client — never parsed or constructed client-side. `null` means the end of the collection. */
  nextCursor: string | null;
}
