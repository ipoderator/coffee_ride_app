CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"gpx_file_key" text NOT NULL,
	"gpx_file_name" text NOT NULL,
	"gpx_file_size_bytes" integer NOT NULL,
	"distance_km" numeric(6, 1) NOT NULL,
	"elevation_gain_meters" integer NOT NULL,
	"point_count" integer NOT NULL,
	"geometry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "routes_distance_km_non_negative" CHECK ("routes"."distance_km" >= 0),
	CONSTRAINT "routes_elevation_gain_non_negative" CHECK ("routes"."elevation_gain_meters" >= 0),
	CONSTRAINT "routes_point_count_positive" CHECK ("routes"."point_count" >= 1),
	CONSTRAINT "routes_gpx_file_size_positive" CHECK ("routes"."gpx_file_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routes_ride_id_unique" ON "routes" USING btree ("ride_id");