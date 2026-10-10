CREATE TYPE "public"."admin_action_type" AS ENUM('admin_granted', 'admin_revoked', 'user_email_verified', 'user_verification_resent', 'user_sessions_revoked', 'user_blocked', 'user_unblocked', 'ride_hidden', 'ride_unhidden', 'ride_cancelled', 'review_hidden', 'review_unhidden');--> statement-breakpoint
CREATE TYPE "public"."admin_target_type" AS ENUM('user', 'ride', 'review');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"action" "admin_action_type" NOT NULL,
	"target_type" "admin_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_actions_reason_not_blank" CHECK ("admin_actions"."reason" is null or length(btrim("admin_actions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "hidden_by" uuid;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_by" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_created_at_id_idx" ON "admin_actions" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_actions_target_idx" ON "admin_actions" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_block_reason_with_block" CHECK (("users"."blocked_at" is null) = ("users"."block_reason" is null));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_hidden_reason_with_hide" CHECK (("rides"."hidden_at" is null) = ("rides"."hidden_reason" is null));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_reason_with_hide" CHECK (("reviews"."hidden_at" is null) = ("reviews"."hidden_reason" is null));