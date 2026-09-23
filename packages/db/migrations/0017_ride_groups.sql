CREATE TABLE "ride_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pace_kmh" numeric(4, 1) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ride_groups_id_ride_id_unique" UNIQUE("id","ride_id"),
	CONSTRAINT "ride_groups_pace_kmh_range" CHECK ("ride_groups"."pace_kmh" >= 5 and "ride_groups"."pace_kmh" <= 60),
	CONSTRAINT "ride_groups_name_length" CHECK (char_length("ride_groups"."name") between 1 and 60),
	CONSTRAINT "ride_groups_position_non_negative" CHECK ("ride_groups"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD CONSTRAINT "ride_groups_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_groups" ADD CONSTRAINT "ride_groups_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_groups_ride_id_position_unique" ON "ride_groups" USING btree ("ride_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_groups_ride_id_name_unique" ON "ride_groups" USING btree ("ride_id",lower("name"));--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_group_ride_fk" FOREIGN KEY ("group_id","ride_id") REFERENCES "public"."ride_groups"("id","ride_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_group_ride_fk" FOREIGN KEY ("group_id","ride_id") REFERENCES "public"."ride_groups"("id","ride_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_group_id_idx" ON "registrations" USING btree ("group_id");