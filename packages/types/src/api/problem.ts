/**
 * RFC 9457 (`application/problem+json`) error envelope every non-2xx API
 * response uses — shape fixed by ADR-011 (`docs/api.md` → "Errors").
 *
 * Owned here, not duplicated in `apps/api`, so a future `apps/web` API client
 * can type a failed response the exact same way the API itself constructs it
 * (`.claude/rules/extensibility.md`: shared contracts, not re-derived ones).
 * `apps/api`'s error handler (`src/plugins/error-handler.ts`) is the only
 * place that constructs this shape today; it imports this type instead of
 * redeclaring it.
 */
export interface ProblemDetails {
  /** Stable URI identifying the error type (not necessarily dereferenceable). */
  type: string;
  title: string;
  status: number;
  /** Human-readable, safe to show to the user — never a stack trace or driver internal. */
  detail: string;
  /** The request path/URI this problem occurred on. */
  instance: string;
  /** Stable machine-readable code — prefer switching on this, not `title`. */
  code: string;
  /** Present only for validation failures (one entry per invalid field). */
  errors?: Array<{ path: string; message: string }>;
}
