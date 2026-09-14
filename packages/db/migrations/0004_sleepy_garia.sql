CREATE TYPE "public"."bicycle_type" AS ENUM('road', 'gravel', 'mtb', 'any');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('draft', 'published', 'registration_open', 'registration_closed', 'started', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"bicycle_type" "bicycle_type" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"start_timezone" text NOT NULL,
	"participant_limit" integer,
	"price_rub" integer,
	"distance_km" numeric(6, 1),
	"elevation_gain_meters" integer,
	"pace_kmh" numeric(4, 1),
	"duration_minutes" integer,
	"difficulty" integer,
	"status" "ride_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "rides_participant_limit_positive" CHECK ("rides"."participant_limit" is null or "rides"."participant_limit" >= 1),
	CONSTRAINT "rides_price_rub_non_negative" CHECK ("rides"."price_rub" is null or "rides"."price_rub" >= 0),
	CONSTRAINT "rides_distance_km_non_negative" CHECK ("rides"."distance_km" is null or "rides"."distance_km" >= 0),
	CONSTRAINT "rides_elevation_gain_non_negative" CHECK ("rides"."elevation_gain_meters" is null or "rides"."elevation_gain_meters" >= 0),
	CONSTRAINT "rides_pace_kmh_non_negative" CHECK ("rides"."pace_kmh" is null or "rides"."pace_kmh" >= 0),
	CONSTRAINT "rides_duration_minutes_non_negative" CHECK ("rides"."duration_minutes" is null or "rides"."duration_minutes" >= 0),
	CONSTRAINT "rides_difficulty_range" CHECK ("rides"."difficulty" is null or ("rides"."difficulty" >= 1 and "rides"."difficulty" <= 5))
);
--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_organizer_id_organizer_profiles_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;