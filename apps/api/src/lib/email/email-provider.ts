// ADR-007 ("Notifications" — external provider behind an adapter). No new
// workspace package unlike `packages/maps-core`/`maps-2gis` (ADR-010): only
// `apps/api` ever sends email, so this interface lives here rather than a
// separate pnpm package — same "single consumer, adapter-shaped module, not
// a new package" precedent as `modules/rides/route-storage.ts`'s S3 wrapper.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// Normalized error every adapter implementation throws — mirrors
// `RouteStorageError`'s role for S3 (`.claude/rules/resilience.md`:
// `ResilienceError` never crosses an integration's own boundary).
export class EmailDeliveryError extends Error {}
