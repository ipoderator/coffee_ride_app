// First domain type (CR-011), alongside `packages/db`'s first table. Public-safe
// shape only — no `passwordHash`, ever (`.claude/rules/security.md`). Server
// responses and `apps/web` both consume this exact shape, so there is no second,
// possibly-drifted copy of "what a user looks like over the wire".
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}
