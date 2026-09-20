ALTER TABLE "rides" ADD COLUMN "cover_image_key" text;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cover_image_content_type" text;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cover_image_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cover_image_size_bytes_non_negative" CHECK ("rides"."cover_image_size_bytes" is null or "rides"."cover_image_size_bytes" >= 0);