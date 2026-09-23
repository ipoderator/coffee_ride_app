/**
 * `MapProviderError` (defined in `maps-core` since CR-114) is what this
 * adapter throws from every `MapProvider` method on a failed 2GIS call (timeout,
 * network error, non-2xx response, an open circuit breaker). Callers get one
 * stable error type regardless of which of the three methods failed or why —
 * the caller decides the actual fallback (e.g. "create the ride without
 * geocoded coordinates", per `.claude/rules/resilience.md`'s example); this
 * adapter's job is only to fail predictably, not to swallow the error
 * itself.
 *
 * Bounded retries and the circuit breaker (the rest of what
 * `.claude/rules/maps.md` requires "at the adapter implementation level")
 * are applied in `http.ts` via the shared `resilience` package (CR-049).
 * See KI-016 for the still-open "never exercised against a live 2GIS
 * account" gap.
 */
export { MapProviderError, type MapProviderErrorCode } from 'maps-core/server';
