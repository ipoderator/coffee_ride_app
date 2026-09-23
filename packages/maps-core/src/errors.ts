// Provider-neutral failure type for every `MapProvider` method (CR-114).
// Lives here, not in an adapter package, so a caller (`apps/api`'s route
// builder) can tell "no path on the road graph" from "provider down" without
// importing a concrete adapter — each adapter throws this same class.
export type MapProviderErrorCode =
  /** 2GIS couldn't be reached or answered with an error (timeout, network,
   * 5xx, auth, an open breaker) — worth retrying later. */
  | 'unavailable'
  /** 2GIS answered, but has no path between the requested points on its
   * road graph (e.g. a point in a river or a closed area). Retrying the same
   * request won't help — the caller should ask for different points. */
  | 'no_route';

export class MapProviderError extends Error {
  /** HTTP status from 2GIS, if the request reached it. */
  readonly status?: number;
  readonly code: MapProviderErrorCode;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      status?: number;
      code?: MapProviderErrorCode;
    },
  ) {
    // `cause` is the standard ES2022 Error field (lib.es2022.error) — not
    // redeclared here, just forwarded to the base constructor.
    super(message, { cause: options?.cause });
    this.name = 'MapProviderError';
    this.status = options?.status;
    this.code = options?.code ?? 'unavailable';
  }
}
