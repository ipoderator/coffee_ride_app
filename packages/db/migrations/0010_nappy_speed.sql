CREATE TYPE "public"."waitlist_entry_status" AS ENUM('waiting', 'promoted', 'cancelled');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "waitlist_entry_status" DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	CONSTRAINT "waitlist_entries_cancelled_at_consistent" CHECK (("waitlist_entries"."status" = 'cancelled') = ("waitlist_entries"."cancelled_at" is not null)),
	CONSTRAINT "waitlist_entries_promoted_at_consistent" CHECK (("waitlist_entries"."status" = 'promoted') = ("waitlist_entries"."promoted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_ride_id_user_id_waiting_unique" ON "waitlist_entries" USING btree ("ride_id","user_id") WHERE "waitlist_entries"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "waitlist_entries_ride_id_idx" ON "waitlist_entries" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_user_id_idx" ON "waitlist_entries" USING btree ("user_id");