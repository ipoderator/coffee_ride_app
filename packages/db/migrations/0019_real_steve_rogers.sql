CREATE TYPE "public"."profile_visibility" AS ENUM('closed', 'co_participants', 'open');--> statement-breakpoint
CREATE TABLE "user_bikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bike_type" "bicycle_type" NOT NULL,
	"brand" text,
	"model" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_visibility" "profile_visibility" DEFAULT 'co_participants' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "distance_week_km" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "distance_month_km" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "distance_year_km" integer;--> statement-breakpoint
ALTER TABLE "user_bikes" ADD CONSTRAINT "user_bikes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_bikes_one_active_per_user" ON "user_bikes" USING btree ("user_id") WHERE "user_bikes"."is_active";--> statement-breakpoint
CREATE INDEX "user_bikes_user_id_idx" ON "user_bikes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_distance_week_km_range" CHECK ("users"."distance_week_km" is null or ("users"."distance_week_km" >= 0 and "users"."distance_week_km" <= 3000));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_distance_month_km_range" CHECK ("users"."distance_month_km" is null or ("users"."distance_month_km" >= 0 and "users"."distance_month_km" <= 10000));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_distance_year_km_range" CHECK ("users"."distance_year_km" is null or ("users"."distance_year_km" >= 0 and "users"."distance_year_km" <= 100000));