CREATE TYPE "public"."route_point_type" AS ENUM('start', 'finish', 'stop', 'danger', 'water', 'food', 'technical', 'other');--> statement-breakpoint
CREATE TABLE "route_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"type" "route_point_type" NOT NULL,
	"label" text,
	"description" text,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "route_points_lat_range" CHECK ("route_points"."lat" >= -90 and "route_points"."lat" <= 90),
	CONSTRAINT "route_points_lng_range" CHECK ("route_points"."lng" >= -180 and "route_points"."lng" <= 180)
);
--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_points_ride_id_idx" ON "route_points" USING btree ("ride_id");