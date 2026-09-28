ALTER TABLE "routes" ADD COLUMN "preview" jsonb;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_preview_is_array" CHECK ("routes"."preview" is null or jsonb_typeof("routes"."preview") = 'array');--> statement-breakpoint
-- KI-058 backfill: routes written before this migration get an even-stride sketch
-- of at most 40 points (ROUTE_PREVIEW_MAX_POINTS) including both ends. The API
-- recomputes a shape-preserving (Douglas–Peucker) preview on the next write of the
-- route; no production data existed when this shipped.
UPDATE "routes" SET "preview" = (
  SELECT jsonb_agg(
    jsonb_build_array(
      round((p.value->>'lat')::numeric, 5),
      round((p.value->>'lng')::numeric, 5)
    ) ORDER BY p.ord
  )
  FROM jsonb_array_elements("routes"."geometry") WITH ORDINALITY AS p(value, ord)
  WHERE (p.ord - 1) % greatest(1, ceil((jsonb_array_length("routes"."geometry") - 1)::numeric / 38)::int) = 0
    OR p.ord = jsonb_array_length("routes"."geometry")
)
WHERE jsonb_array_length("routes"."geometry") >= 2;
