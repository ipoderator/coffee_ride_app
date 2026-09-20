ALTER TABLE "users" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_content_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "organizer_profiles" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "organizer_profiles" ADD COLUMN "avatar_content_type" text;--> statement-breakpoint
ALTER TABLE "organizer_profiles" ADD COLUMN "avatar_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_size_bytes_non_negative" CHECK ("users"."avatar_size_bytes" is null or "users"."avatar_size_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "organizer_profiles" ADD CONSTRAINT "organizer_profiles_avatar_size_bytes_non_negative" CHECK ("organizer_profiles"."avatar_size_bytes" is null or "organizer_profiles"."avatar_size_bytes" >= 0);