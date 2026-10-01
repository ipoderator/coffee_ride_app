CREATE TYPE "public"."ride_contact_type" AS ENUM('phone', 'telegram', 'max', 'email');--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "contact_type" "ride_contact_type";--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "contact_value" text;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_contact_both_or_neither" CHECK (("rides"."contact_type" is null and "rides"."contact_value" is null) or ("rides"."contact_type" is not null and "rides"."contact_value" is not null));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_contact_value_not_blank" CHECK ("rides"."contact_value" is null or length(btrim("rides"."contact_value")) > 0);