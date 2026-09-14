// First domain type (CR-011), alongside `packages/db`'s first table. Public-safe
// shape only — no `passwordHash`, ever (`.claude/rules/security.md`). Server
// responses and `apps/web` both consume this exact shape, so there is no second,
// possibly-drifted copy of "what a user looks like over the wire".
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  // Profile fields (CR-013). Required-but-nullable, not optional: the server
  // always includes these keys (`null` when unset) in every response that
  // returns a `User` (`toPublicUser`) — the type says so. A handful of
  // pre-existing test fixtures that construct a `User` literal needed a
  // one-line update for this; that's a smaller, more honest cost than a type
  // that lies about a field the wire format always sends.
  displayName: string | null;
  phone: string | null;
  bio: string | null;
}
