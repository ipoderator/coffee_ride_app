// ADR-019/CR-086: the API returns `coverImageUrl` as a bare, versioned path
// (`/v1/rides/:id/cover`, ADR-011's contract convention — no consumer-specific
// prefix baked in). `/api` is purely a same-origin `next.config.ts` rewrite
// artifact (ADR-013: single origin, no CORS) specific to this app, not part of
// the API's own contract — every feature that renders an API-served asset
// (`RideCard`, `RideDetailView`, `CoverImageUploadForm`) needs this same
// translation, so it lives here rather than being duplicated per feature.
export function apiAssetUrl(path: string): string {
  return `/api${path}`;
}
