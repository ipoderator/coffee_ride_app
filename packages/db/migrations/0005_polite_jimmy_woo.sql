ALTER TABLE "rides" ADD COLUMN "start_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "start_lng" numeric(9, 6);--> statement-breakpoint
CREATE INDEX "rides_start_lat_lng_idx" ON "rides" USING btree ("start_lat","start_lng");--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_start_lat_range" CHECK ("rides"."start_lat" is null or ("rides"."start_lat" >= -90 and "rides"."start_lat" <= 90));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_start_lng_range" CHECK ("rides"."start_lng" is null or ("rides"."start_lng" >= -180 and "rides"."start_lng" <= 180));