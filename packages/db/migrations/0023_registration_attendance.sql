CREATE TYPE "public"."registration_attendance" AS ENUM('finished', 'no_show');--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "finish_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "attendance" "registration_attendance";--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "attendance_marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "attendance_marked_by" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_attendance_marked_by_users_id_fk" FOREIGN KEY ("attendance_marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_attendance_consistent" CHECK (("registrations"."attendance" is null) = ("registrations"."attendance_marked_at" is null) and ("registrations"."attendance" is null) = ("registrations"."attendance_marked_by" is null));--> statement-breakpoint
-- Backfill: before CR-181 every active registrant of a finished ride could review it,
-- so those rides' registrants are recorded as finished (by the ride's own organizer)
-- and keep that ability. Rides that finish from now on start undecided.
UPDATE "registrations" AS r SET "attendance" = 'finished', "attendance_marked_at" = r."updated_at", "attendance_marked_by" = op."user_id" FROM "rides" AS ri INNER JOIN "organizer_profiles" AS op ON op."id" = ri."organizer_id" WHERE ri."id" = r."ride_id" AND ri."status" = 'finished' AND r."status" = 'active';
