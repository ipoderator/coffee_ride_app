CREATE TYPE "public"."registration_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "registrations_cancelled_at_consistent" CHECK (("registrations"."status" = 'cancelled') = ("registrations"."cancelled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_ride_id_user_id_active_unique" ON "registrations" USING btree ("ride_id","user_id") WHERE "registrations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "registrations_ride_id_idx" ON "registrations" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "registrations_user_id_idx" ON "registrations" USING btree ("user_id");