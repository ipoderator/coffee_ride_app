CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"duration_minutes" integer,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "stops_lat_range" CHECK ("stops"."lat" >= -90 and "stops"."lat" <= 90),
	CONSTRAINT "stops_lng_range" CHECK ("stops"."lng" >= -180 and "stops"."lng" <= 180),
	CONSTRAINT "stops_duration_minutes_non_negative" CHECK ("stops"."duration_minutes" is null or "stops"."duration_minutes" >= 0),
	CONSTRAINT "stops_position_non_negative" CHECK ("stops"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stops_ride_id_position_unique" ON "stops" USING btree ("ride_id","position");--> statement-breakpoint
CREATE INDEX "stops_ride_id_idx" ON "stops" USING btree ("ride_id");