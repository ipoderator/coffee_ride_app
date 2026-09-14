import type { ProblemDetails } from 'types';

// Extracted from `features/auth/register/api.ts` (CR-011) when a second and
// third feature (`features/auth/login`, `features/participant/profile`,
// CR-013) needed the exact same wrapper — a cross-cutting concern
// (`.claude/rules/extensibility.md` allows a feature module to depend on
// shared, non-feature-specific utilities like this one), not something each
// feature's own `api.ts` should redefine.
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiError';
  }
}
